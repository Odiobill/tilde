import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectRuntime, probeCapabilities, childEnvironment } from './release/runtime.mjs';
import { writeQualificationReport } from './release/report.mjs';
import { runCommand } from './release/commands.mjs';
import { parseArgs } from 'node:util';
import { exportSource } from './export-source.mjs';
const { values } = parseArgs({ options: { matrix: { type: 'string' }, evidence: { type: 'string' }, 'npm-cache': { type: 'string' }, acquire: { type: 'boolean', default: false } } });
if (!values.matrix || !values.evidence || !values['npm-cache']) throw new Error('RUNTIME_MATRIX_EVIDENCE_AND_NPM_CACHE_REQUIRED');
const root = resolve('.'), evidence = resolve(values.evidence), cache = resolve(values['npm-cache']);
if (evidence === root || !relative(root, evidence)) throw new Error('PRIVATE_EVIDENCE_DIRECTORY_REQUIRED');
await mkdir(evidence, { recursive: false, mode: 0o700 });
const matrix = JSON.parse(await readFile(values.matrix, 'utf8'));
const cases = [];
async function digestTree(directory) {
  const files = {};
  for (const name of await readdir(directory)) { const path = join(directory, name); files[name] = createHash('sha256').update(await readFile(path)).digest('hex'); }
  return files;
}
async function sourceManifest(directory, prefix = '') {
  const files = {};
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    if (['node_modules', '.build', '.superpowers', 'dist'].includes(entry.name) || entry.name.endsWith('.tsbuildinfo')) continue;
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(files, await sourceManifest(directory, path));
    else if (entry.isFile()) files[path] = createHash('sha256').update(await readFile(join(directory, path))).digest('hex');
  }
  return files;
}
for (const lane of matrix.lanes) {
  const dir = join(evidence, lane.id); await mkdir(dir, { mode: 0o700 });
  const row = { id: `runtime.${lane.id}`, required: true, status: 'unavailable', environment: `linux-${process.arch}`, evidence: [`${lane.id}/runtime.json`], exitCode: null, cleanup: true, details: {} };
  cases.push(row);
  const selection = { ...row, id: `${row.id}.selection`, status: 'not_run', details: {} };
  const native = { ...row, id: `${row.id}.native`, status: 'not_run', details: {} };
  cases.push(selection, native);
  const executable = process.env[lane.executableEnv] ?? (lane.systemDefault ? process.execPath : undefined);
  if (!executable) { row.details.reason = 'runtime_not_selected'; await writeFile(join(dir, 'runtime.json'), JSON.stringify(row.details)); continue; }
  try {
    const runtime = await inspectRuntime(executable);
    if (lane.version && runtime.version !== lane.version) throw new Error('RUNTIME_LANE_VERSION_MISMATCH');
    row.details = { runtime, binarySha256: createHash('sha256').update(await readFile(runtime.executable)).digest('hex'), nativeAbiScope: 'fresh build for this exact executable/header pair' };
    Object.assign(selection, { status: 'pass', exitCode: 0, cleanup: true });
    await writeFile(join(dir, 'runtime.json'), JSON.stringify(row.details, null, 2) + '\n');
    const exported = await exportSource({ root, output: join(dir, 'public-input'), version: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version });
    const source = exported.tree;
    row.details.publicSourceArchiveSha256 = exported.sha256;
    const manifest = await sourceManifest(source);
    await writeFile(join(dir, 'source-input-sha256.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    row.details.sourceSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    const home = join(dir, 'home'); await mkdir(home, { mode: 0o700 });
    const env = childEnvironment(runtime.executable, { HOME: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'), XDG_CACHE_HOME: join(home, 'cache'), npm_config_userconfig: '/dev/null', npm_config_cache: cache });
    const npm = '/usr/bin/npm';
    const cmake = process.env.TILDE_CMAKE ?? 'cmake';
    const ctest = cmake.includes('/') ? join(dirname(cmake), 'ctest') : 'ctest';
    const commands = [
      ['dependencies', npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund', ...(values.acquire ? [] : ['--offline'])]],
      ['build', npm, ['run', 'build']], ['typecheck', npm, ['run', 'typecheck']],
      ['product-tests', npm, ['test']], ['release-tests', npm, ['run', 'test:release']],
      ['python-tests', 'python3', ['-m', 'unittest', 'discover', '-s', 'tests/qualification/power', '-p', '*_test.py']],
      ['ctest', ctest, ['--test-dir', '.build/cmake', '--output-on-failure']]
    ];
    let failed = false;
    for (const [name, command, args] of commands) {
      const result = await runCommand({ executable: command, args, cwd: source, env, evidence: dir, name, timeout: name === 'build' ? 900000 : 300000 });
      row.evidence.push(`${lane.id}/${name}.log`, `${lane.id}/${name}.command.json`);
      if (result.exitCode !== 0 || result.timedOut) { row.status = 'fail'; row.exitCode = result.exitCode; row.details.failedPhase = name; failed = true; break; }
      if (name === 'build') {
        native.details.capabilities = await probeCapabilities(runtime.executable, source, { native: true });
        native.details.addons = { transport: await digestTree(join(source, 'packages/transport/.build')), filesystem: await digestTree(join(source, 'packages/tools/.build')) };
        native.status = Object.values(native.details.capabilities).every(Boolean) ? 'pass' : 'fail';
        native.exitCode = native.status === 'pass' ? 0 : 1;
        native.evidence = [`${lane.id}/native.json`, `${lane.id}/build.log`];
        await writeFile(join(dir, 'native.json'), JSON.stringify(native.details, null, 2) + '\n', { flag: 'wx' });
      }
    }
    if (!failed) {
      row.details.capabilities = await probeCapabilities(runtime.executable, source, { native: true });
      row.details.addons = { transport: await digestTree(join(source, 'packages/transport/.build')), filesystem: await digestTree(join(source, 'packages/tools/.build')) };
      row.status = Object.values(row.details.capabilities).every(Boolean) ? 'pass' : 'fail'; row.exitCode = row.status === 'pass' ? 0 : 1;
    }
    await writeFile(join(dir, 'runtime.json'), JSON.stringify(row.details, null, 2) + '\n');
  } catch (error) { row.status = error.code === 'NODE_EXECUTABLE_MISSING' ? 'unavailable' : 'fail'; row.exitCode = row.status === 'fail' ? 1 : null; row.details.reason = error.code ?? error.message; await writeFile(join(dir, 'runtime.json'), JSON.stringify(row.details, null, 2) + '\n'); }
  console.log(`${lane.id}: ${row.status}${row.details.failedPhase ? ` (${row.details.failedPhase})` : ''}`);
  await writeQualificationReport({ path: join(evidence, 'report.json'), runId: evidence.split('/').at(-1), environment: `linux-${process.arch}`, cases });
}
await writeQualificationReport({ path: join(evidence, 'report.json'), runId: evidence.split('/').at(-1), environment: `linux-${process.arch}`, cases });
if (cases.some(row => row.status !== 'pass')) process.exitCode = 1;
