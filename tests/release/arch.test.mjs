import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stageInstall } from '../../scripts/stage-install.mjs';
async function temporary(t) { const dir = await mkdtemp(join(tmpdir(), 'tilde-arch-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
test('packagePhaseWorksWithFakerootStatx', async t => {
  const dir = await temporary(t), srcdir = join(dir, 'source'), pkgdir = join(dir, 'package');
  await mkdir(srcdir); await mkdir(pkgdir); await symlink(resolve('.'), join(srcdir, 'tilde-0.1.1'));
  await stageInstall({ root: resolve('.'), destdir: join(srcdir, 'tilde-stage'), prefix: '/usr', nodeExecutable: process.execPath });
  const result = spawnSync('fakeroot', ['--', '/usr/bin/bash', '-c', 'srcdir=$1; pkgdir=$2; source "$3"; package', '--', srcdir, pkgdir, resolve('packaging/arch/PKGBUILD')], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(pkgdir, 'usr/lib/tilde/install-manifest.json'), 'utf8'), await readFile(join(srcdir, 'tilde-stage/usr/lib/tilde/install-manifest.json'), 'utf8'));
});
test('stagedNativeBinariesHaveNoCwdSearchRpath', async t => {
  const dir = await temporary(t); await stageInstall({ root: resolve('.'), destdir: dir, prefix: '/usr', nodeExecutable: process.execPath });
  const output = spawnSync('readelf', ['-d', join(dir, 'usr/bin/tilde-gui')], { encoding: 'utf8' }); assert.equal(output.status, 0);
  const paths = [...output.stdout.matchAll(/(?:RUNPATH|RPATH).*\[([^\]]*)\]/g)].flatMap(m => m[1].split(':'));
  assert.ok(paths.every(path => path === '$ORIGIN' || path === '$ORIGIN/../lib'), 'installed ELF must not search cwd or build-host paths');
});
test('recipeUsesVerifiedLocalSource', async t => {
  const dir = await temporary(t), source = join(dir, 'source.tar.gz'); await writeFile(source, 'corrupt source');
  const { prepareArchBuild } = await import('../../scripts/prepare-arch-build.mjs');
  await assert.rejects(prepareArchBuild({ source, sha256: 'a'.repeat(64), output: join(dir, 'out') }), /SOURCE_DIGEST_MISMATCH/);
});
test('packageContainsCompleteRuntimeClosure', async t => {
  const dir = await temporary(t), { inspectArchTree } = await import('../../scripts/qualify-arch.mjs');
  await stageInstall({ root: resolve('.'), destdir: dir, prefix: '/usr', nodeExecutable: process.execPath });
  const qt = spawnSync('qmake6', ['-query', 'QT_VERSION'], { encoding: 'utf8' }).stdout.trim();
  const info = { architecture: 'x86_64', dependencies: ['nodejs>=22.19.0', `qt6-base>=${qt}`, `qt6-declarative>=${qt}`, 'systemd', 'coreutils', 'bash', 'libuv', 'glibc', 'gcc-libs', 'libglvnd'] };
  assert.equal((await inspectArchTree(dir, info)).valid, true);
  await rm(join(dir, 'usr/lib/tilde/app/packages/transport/.build/tilde_peer.node'));
  const missing = await inspectArchTree(dir, info); assert.equal(missing.valid, false); assert.ok(missing.problems.includes('missing-native-addon'));
});
test('noBundledNodeOrServiceHooks', async t => {
  const dir = await temporary(t), { inspectArchTree } = await import('../../scripts/qualify-arch.mjs');
  await mkdir(join(dir, 'usr/bin'), { recursive: true }); await writeFile(join(dir, 'usr/bin/node'), 'SYNTHETIC runtime'); await writeFile(join(dir, '.INSTALL'), 'echo synthetic');
  const report = await inspectArchTree(dir, { architecture: 'x86_64', dependencies: [] }); assert.equal(report.valid, false); assert.ok(report.problems.includes('bundled-runtime')); assert.ok(report.problems.includes('service-hook'));
});
test('runtimeAndQtDependenciesMatchLinkedArtifacts', async t => {
  const dir = await temporary(t), { inspectArchTree } = await import('../../scripts/qualify-arch.mjs');
  await stageInstall({ root: resolve('.'), destdir: dir, prefix: '/usr', nodeExecutable: process.execPath });
  const report = await inspectArchTree(dir, { architecture: 'x86_64', dependencies: ['nodejs>=22.19.0', 'qt6-base>=6.8', 'systemd', 'coreutils', 'bash', 'libuv', 'glibc', 'gcc-libs', 'libglvnd'] });
  assert.equal(report.valid, false); assert.ok(report.problems.includes('missing-qt-qml-dependency'));
});
test('installedPackagePreservesUserStateOnRemoval', async t => {
  const dir = await temporary(t), { inspectArchTree } = await import('../../scripts/qualify-arch.mjs');
  await mkdir(join(dir, 'home/user'), { recursive: true }); await writeFile(join(dir, 'home/user/conversation'), 'retained');
  const report = await inspectArchTree(dir, { architecture: 'x86_64', dependencies: [] }); assert.equal(report.valid, false); assert.ok(report.problems.includes('owns-user-state'));
  assert.equal(await readFile(join(dir, 'home/user/conversation'), 'utf8'), 'retained');
});
