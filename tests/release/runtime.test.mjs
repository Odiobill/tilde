import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// A relaxed version boundary, mismatched headers or hardcoded CMake Node breaks these cases.
async function fixture(t, version = '22.19.0', headerVersion = version) {
  const root = await mkdtemp(join(tmpdir(), 'tilde-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const headers = join(root, 'include'); await mkdir(headers);
  const [major, minor, patch] = headerVersion.split('.');
  await writeFile(join(headers, 'node_version.h'), `#define NODE_MAJOR_VERSION ${major}\n#define NODE_MINOR_VERSION ${minor}\n#define NODE_PATCH_VERSION ${patch}\n`);
  await writeFile(join(headers, 'node_api.h'), '/* synthetic header */\n');
  await writeFile(join(headers, 'uv.h'), '/* synthetic header */\n');
  await writeFile(join(headers, 'uv_version.h'), '#define UV_VERSION_MAJOR 1\n#define UV_VERSION_MINOR 53\n#define UV_VERSION_PATCH 0\n');
  const node = join(root, 'selected-node');
  await writeFile(node, `#!${process.execPath}\nconsole.log(${JSON.stringify(JSON.stringify({ version, napiVersion: 10, uvVersion: '1.53.0', capabilities: { sqlite: true, chordLoader: true, nativeTransport: false, nativeFilesystem: false } }))});\n`, { mode: 0o700 });
  return { root, headers, node };
}

test('rejectsNode20BeforeStateAccess', async t => {
  const f = await fixture(t, '20.19.0');
  const { inspectRuntime } = await import('../../scripts/release/runtime.mjs');
  await assert.rejects(inspectRuntime(f.node, f.headers, f.headers), { code: 'NODE_UNSUPPORTED' });
  assert.equal(await readFile(join(f.headers, 'node_api.h'), 'utf8'), '/* synthetic header */\n');
});
test('acceptsFloorAndNewerCapabilities', async t => {
  const { inspectRuntime } = await import('../../scripts/release/runtime.mjs');
  for (const version of ['22.19.0', '22.22.0', '24.22.1', '26.12.1']) {
    const f = await fixture(t, version);
    const info = await inspectRuntime(f.node, f.headers, f.headers);
    assert.equal(info.version, version); assert.equal(info.capabilities.sqlite, true);
    assert.equal(info.capabilities.nativeTransport, false);
    assert.equal(info.headers.nodeVersion, version);
  }
});
test('rejectsMismatchedHeaders', async t => {
  const f = await fixture(t, '22.19.0', '24.22.1');
  const { inspectRuntime } = await import('../../scripts/release/runtime.mjs');
  await assert.rejects(inspectRuntime(f.node, f.headers, f.headers), { code: 'NODE_HEADERS_MISMATCH' });
});
test('usesSelectedNodeInFixtureDefinitions', async t => {
  const f = await fixture(t, process.versions.node);
  const { nativeConfigureArgs } = await import('../../scripts/release/runtime.mjs');
  const args = nativeConfigureArgs({ executable: f.node, headers: { nodeIncludeDir: f.headers, uvIncludeDir: f.headers } });
  assert.ok(args.includes(`-DTILDE_NODE_EXECUTABLE=${f.node}`));
  assert.ok(args.includes(`-DNODE_INCLUDE_DIR=${f.headers}`));
});
test('actualSelectedNodeExercisesSQLiteChordAndAddons', async () => {
  const { probeCapabilities } = await import('../../scripts/release/runtime.mjs');
  const capabilities = await probeCapabilities(process.execPath, resolve('.'), { native: true });
  assert.deepEqual(capabilities, { sqlite: true, chordLoader: true, nativeTransport: true, nativeFilesystem: true });
});
test('compatibleRuntimeIsNotRejectedByTheOldExactPin', async t => {
  const f = await fixture(t);
  // The pre-change build driver rejects the floor before even reaching CMake.
  const preload = join(f.root, 'version.cjs');
  await writeFile(preload, "Object.defineProperty(process.versions,'node',{value:'22.19.0'});\n");
  const cmake = join(f.root, 'cmake');
  await writeFile(cmake, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const child = spawnSync(process.execPath, ['--require', preload, 'scripts/build-native.mjs'], {
    encoding: 'utf8', env: { ...process.env, TILDE_NODE: f.node, TILDE_NODE_INCLUDE_DIR: f.headers, TILDE_UV_INCLUDE_DIR: f.headers, TILDE_CMAKE: cmake }
  });
  assert.equal(child.status, 0, child.stderr);
});
test('syntheticChildPreservesTrayBackendButDropsCredentials', async () => {
  const { childEnvironment } = await import('../../scripts/release/runtime.mjs');
  const saved = { QT_QPA_PLATFORMTHEME: process.env.QT_QPA_PLATFORMTHEME, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  try {
    process.env.QT_QPA_PLATFORMTHEME = 'synthetic-platform-theme';
    process.env.OPENAI_API_KEY = 'SYNTHETIC_NOT_A_CREDENTIAL';
    const env = childEnvironment(process.execPath);
    assert.equal(env.QT_QPA_PLATFORMTHEME, 'synthetic-platform-theme');
    assert.equal(env.OPENAI_API_KEY, undefined);
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
test('explicitNodeOverrideRunsTheRequestedExecutable', async t => {
  const f = await fixture(t);
  const child = spawnSync(process.execPath, ['scripts/with-runtime.mjs', '-e', 'throw new Error("wrong runtime")'], {
    encoding: 'utf8', env: { ...process.env, TILDE_NODE: f.node, TILDE_NODE_INCLUDE_DIR: f.headers, TILDE_UV_INCLUDE_DIR: f.headers }
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).version, '22.19.0');
});
