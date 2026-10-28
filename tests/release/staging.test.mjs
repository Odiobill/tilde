import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, lstat, realpath, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
async function temporary(t) { const dir = await mkdtemp(join(tmpdir(), 'tilde-stage-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

test('installedBridgeUsesFixedFinalPaths', async t => {
  const dir = await temporary(t), app = join(dir, 'app/apps/daemon/dist'); await mkdir(app, { recursive: true });
  await writeFile(join(dir, 'app/package.json'), '{"type":"module"}');
  for (const file of ['desktop-bridge.js', 'desktop-protocol.js']) await cp(`apps/daemon/dist/${file}`, join(app, file));
  const expected = { helper: '/opt/tilde/lib/tilde/tilde-desktop-bridge', frontend: '/opt/tilde/bin/tilde-gui' };
  await writeFile(join(app, 'install-paths.js'), `export const installedExecutables = Object.freeze(${JSON.stringify(expected)});\n`);
  const bridge = await import(pathToFileURL(join(app, 'desktop-bridge.js')));
  assert.deepEqual(bridge.desktopExecutables, expected);
});
test('sourcePrefixEscapingIsFormatSpecific', async () => {
  const { systemdQuote, desktopQuote, shellQuote } = await import('../../scripts/release/layout.mjs');
  const path = '/opt/Tilde space " % $ ` \\';
  const child = spawnSync('/bin/sh', ['-c', `printf '%s' ${shellQuote(path)}`], { encoding: 'utf8' });
  assert.equal(child.status, 0); assert.equal(child.stdout, path);
  assert.ok(systemdQuote(path).includes('%%')); assert.ok(systemdQuote(path).includes('$$'));
  assert.ok(desktopQuote(path).includes('%%')); assert.ok(desktopQuote(path).includes('\\$'));
  assert.notEqual(systemdQuote(path), desktopQuote(path));
});
test('destdirNeverAppearsInLaunchFiles', async t => {
  const dir = await temporary(t), { stageInstall } = await import('../../scripts/stage-install.mjs');
  const destdir = join(dir, 'stage'), prefix = '/opt/Tilde space " % $';
  const manifest = await stageInstall({ root: resolve('.'), destdir, prefix, nodeExecutable: process.execPath });
  for (const name of ['bin/tilde-agentd', 'lib/systemd/user/tilde-agentd.service', 'share/applications/tilde-gui.desktop']) {
    const text = await readFile(join(destdir, prefix, name), 'utf8'); assert.ok(!text.includes(destdir));
  }
  assert.equal(manifest.prefix, prefix);
  assert.equal(manifest.executables.frontend, prefix + '/bin/tilde-gui');
});
test('workspaceLinksStayInsideStage', async t => {
  const dir = await temporary(t), { stageInstall } = await import('../../scripts/stage-install.mjs');
  const manifest = await stageInstall({ root: resolve('.'), destdir: dir, prefix: '/usr', nodeExecutable: process.execPath });
  for (const file of manifest.files.filter(f => f.type === 'symlink')) {
    const target = await realpath(join(dir, 'usr', file.path));
    assert.ok(!relative(join(dir, 'usr'), target).startsWith('..'), file.path);
  }
  await assert.rejects(lstat(join(dir, 'usr/lib/tilde/app/node_modules/typescript')));
  await assert.rejects(lstat(join(dir, 'usr/lib/tilde/app/tests')));
});
test('uninstallPreservesStateAndModifiedFiles', async t => {
  const dir = await temporary(t), { stageInstall } = await import('../../scripts/stage-install.mjs'), { uninstallStaged } = await import('../../scripts/uninstall-staged.mjs');
  const manifest = await stageInstall({ root: resolve('.'), destdir: dir, prefix: '/usr', nodeExecutable: process.execPath });
  const state = join(dir, 'home/state'); await mkdir(state, { recursive: true }); await writeFile(join(state, 'conversation'), 'retained');
  await writeFile(join(dir, 'usr/bin/tilde-agentd'), 'owner modification');
  await chmod(join(dir, 'usr/share/icons'), 0o700);
  await writeFile(join(dir, 'usr/unrelated'), 'sentinel');
  const result = await uninstallStaged({ destdir: dir, manifest });
  assert.ok(result.preserved.includes('bin/tilde-agentd'));
  assert.ok(result.preserved.includes('share/icons'));
  assert.equal(await readFile(join(state, 'conversation'), 'utf8'), 'retained');
  assert.equal(await readFile(join(dir, 'usr/unrelated'), 'utf8'), 'sentinel');
  await assert.rejects(uninstallStaged({ destdir: dir, manifest: { ...manifest, files: [{ path: '../home/state/conversation', type: 'file', mode: 420, sha256: 'a'.repeat(64) }] } }));
});
test('uninstallRejectsSymlinkParentsBeforeMutation', async t => {
  const dir = await temporary(t), { uninstallStaged } = await import('../../scripts/uninstall-staged.mjs');
  await mkdir(join(dir, 'usr/bin'), { recursive: true }); await writeFile(join(dir, 'usr/bin/owned'), 'owned');
  await mkdir(join(dir, 'outside')); await writeFile(join(dir, 'outside/sentinel'), 'retained'); await symlink('../outside', join(dir, 'usr/link'));
  await assert.rejects(uninstallStaged({ destdir: dir, manifest: { version: 1, prefix: '/usr', nodeExecutable: process.execPath, files: [
    { path: 'bin/owned', type: 'file', mode: 420, sha256: 'a'.repeat(64) }, { path: 'link/sentinel', type: 'file', mode: 420, sha256: 'b'.repeat(64) }
  ] } }));
  assert.equal(await readFile(join(dir, 'usr/bin/owned'), 'utf8'), 'owned'); assert.equal(await readFile(join(dir, 'outside/sentinel'), 'utf8'), 'retained');
});
test('stagedTreeRunsWithoutCheckout', async t => {
  const { installedSmoke } = await import('./installed-smoke.mjs');
  assert.equal((await installedSmoke()).cleanup, true);
});
test('missingHelperFailsSafely', async t => {
  const dir = await temporary(t), app = join(dir, 'apps/daemon/dist'); await mkdir(app, { recursive: true }); await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  for (const file of ['desktop-bridge.js', 'desktop-protocol.js']) await cp(`apps/daemon/dist/${file}`, join(app, file));
  await writeFile(join(app, 'install-paths.js'), `export const installedExecutables=Object.freeze({helper:${JSON.stringify(join(dir, 'missing'))},frontend:${JSON.stringify(join(dir, 'missing-gui'))}});`);
  const { DesktopBridge } = await import(pathToFileURL(join(app, 'desktop-bridge.js'))); const bridge = new DesktopBridge();
  try { assert.equal(await bridge.start(), false); } finally { await bridge.close(); }
});
