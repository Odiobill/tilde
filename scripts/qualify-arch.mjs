import { readFile, lstat, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { sha256, within } from './release/files.mjs';
import { childEnvironment } from './release/runtime.mjs';
import { writeQualificationReport } from './release/report.mjs';
import { runCommand } from './release/commands.mjs';
async function names(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) { const path = join(prefix, entry.name); files.push(path); if (entry.isDirectory()) files.push(...await names(root, path)); }
  return files;
}
export async function inspectArchTree(tree, info) {
  const problems = [], files = await names(tree);
  const dependencies = info.dependencies ?? [], has = name => dependencies.some(d => d === name || d.startsWith(name + '>') || d.startsWith(name + '='));
  if (info.architecture !== 'x86_64') problems.push('wrong-architecture');
  if (files.some(p => p === '.INSTALL' || p.startsWith('usr/share/libalpm/hooks/'))) problems.push('service-hook');
  for (const path of files) if ((/(?:^|\/)node(?:\.exe)?$/.test(path) && (await lstat(join(tree, path))).isFile()) || /libQt6[^/]*\.so/.test(path)) problems.push('bundled-runtime');
  if (files.some(p => /^(?:home|root|run|var)\//.test(p))) problems.push('owns-user-state');
  for (const path of ['usr/lib/tilde/app/packages/transport/.build/tilde_peer.node', 'usr/lib/tilde/app/packages/tools/.build/tilde_scoped_fs.node']) if (!files.includes(path)) problems.push('missing-native-addon');
  for (const path of ['usr/bin/tilde-agentd', 'usr/bin/tilde-gui', 'usr/lib/tilde/tilde-desktop-bridge', 'usr/lib/systemd/user/tilde-agentd.service', 'usr/share/applications/tilde-gui.desktop', 'usr/share/icons/hicolor/scalable/apps/tilde-gui.svg', 'usr/lib/tilde/install-manifest.json']) if (!files.includes(path)) problems.push('missing-install-file');
  for (const path of files) if ((await lstat(join(tree, path))).isSymbolicLink() && !within(join(tree, 'usr'), await realpath(join(tree, path)))) problems.push('escaping-package-link');
  if (files.includes('usr/lib/tilde/install-manifest.json')) {
    try {
      const manifest = JSON.parse(await readFile(join(tree, 'usr/lib/tilde/install-manifest.json'), 'utf8'));
      if (manifest.prefix !== '/usr' || manifest.executables.helper !== '/usr/lib/tilde/tilde-desktop-bridge' || manifest.executables.frontend !== '/usr/bin/tilde-gui') problems.push('wrong-installed-paths');
      for (const record of manifest.files) {
        const path = resolve(tree, 'usr', record.path);
        if (!within(join(tree, 'usr'), path)) { problems.push('escaping-manifest-path'); continue; }
        try {
          const stat = await lstat(path);
          if (record.type === 'file' && (!stat.isFile() || record.sha256 && sha256(await readFile(path)) !== record.sha256 || (stat.mode & 0o777) !== record.mode)) problems.push('install-manifest-mismatch');
        } catch { problems.push('install-manifest-missing-file'); }
      }
    } catch { problems.push('invalid-install-manifest'); }
  }
  if (files.includes('usr/bin/tilde-gui')) {
    const result = spawnSync('readelf', ['-d', join(tree, 'usr/bin/tilde-gui')], { encoding: 'utf8', timeout: 5000 });
    if (result.status !== 0) problems.push('invalid-gui-elf');
    else {
      if (/libQt6(?:Quick|Qml)/.test(result.stdout) && !has('qt6-declarative')) problems.push('missing-qt-qml-dependency');
      if (/libQt6(?:Core|Gui|Widgets|Network|DBus)/.test(result.stdout) && !has('qt6-base')) problems.push('missing-qt-base-dependency');
      const symbols = spawnSync('readelf', ['--version-info', join(tree, 'usr/bin/tilde-gui')], { encoding: 'utf8', timeout: 5000 });
      const qtMinor = Math.max(8, ...[...symbols.stdout.matchAll(/Qt_6\.(\d+)/g)].map(m => Number(m[1])));
      for (const name of ['qt6-base', 'qt6-declarative']) {
        const declared = dependencies.find(d => d.startsWith(name + '>=') || d.startsWith(name + '='));
        const version = declared?.match(/(?:>=|=)(6)\.(\d+)(?:\.(\d+))?$/);
        if (has(name) && (!version || Number(version[2]) < qtMinor)) problems.push('qt-binary-version-floor-too-low');
      }
      const paths = [...result.stdout.matchAll(/(?:RUNPATH|RPATH).*\[([^\]]*)\]/g)].flatMap(m => m[1].split(':'));
      if (paths.some(p => !['$ORIGIN', '$ORIGIN/../lib'].includes(p))) problems.push('unsafe-native-rpath');
    }
  }
  for (const name of ['nodejs', 'systemd', 'coreutils', 'bash', 'libuv', 'glibc', 'gcc-libs', 'libglvnd']) if (!has(name)) problems.push('missing-runtime-' + name);
  const node = dependencies.find(d => d.startsWith('nodejs>=' ) || d.startsWith('nodejs='));
  const version = node?.match(/(?:>=|=)(\d+)\.(\d+)\.(\d+)$/);
  if (has('nodejs') && (!version || Number(version[1]) < 22 || Number(version[1]) === 22 && Number(version[2]) < 19)) problems.push('node-version-floor-too-low');
  return { valid: problems.length === 0, problems: [...new Set(problems)], files: files.length };
}
export function parsePackageInfo(text) {
  const get = key => [...text.matchAll(new RegExp('^' + key + ' = (.+)$', 'gm'))].map(m => m[1]);
  return { architecture: get('arch')[0], dependencies: get('depend'), version: get('pkgver')[0], name: get('pkgname')[0] };
}
export async function qualifyArch({ buildRoot, evidence }) {
  buildRoot = resolve(buildRoot); evidence = resolve(evidence);
  const input = JSON.parse(await readFile(join(buildRoot, 'build-input.json'), 'utf8'));
  if (input.kind !== 'local-build-candidate' || input.source !== 'tilde-0.1.0.tar.gz' || ![null, 'npm-cache'].includes(input.npmCache)
    || sha256(await readFile(join(buildRoot, input.source))) !== input.sourceSha256 || sha256(await readFile(join(buildRoot, 'PKGBUILD'))) !== input.recipeSha256) throw new Error('ARCH_INPUT_IDENTITY_MISMATCH');
  await mkdir(evidence, { recursive: false, mode: 0o700 }); const home = join(evidence, 'home'); await mkdir(home, { mode: 0o700 });
  const env = childEnvironment('/usr/bin/node', { HOME: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'), XDG_CACHE_HOME: join(home, 'cache'), TILDE_CMAKE: '/usr/bin/cmake', TILDE_NPM_CACHE: join(buildRoot, input.npmCache ?? 'missing-cache'), PACKAGER: 'Tilde local build', SOURCE_DATE_EPOCH: '1793145600' });
  const cases = [], environment = 'current Arch-family host; not a clean guest';
  const result = await runCommand({ executable: 'makepkg', args: ['--nosign', '--noconfirm', '--log'], cwd: buildRoot, env, evidence, name: 'makepkg', timeout: 900000 });
  cases.push({ id: 'arch.build', required: true, status: result.exitCode === 0 ? 'pass' : 'fail', environment, evidence: ['makepkg.log', 'makepkg.command.json'], exitCode: result.exitCode, cleanup: !result.timedOut, details: { sourceSha256: input.sourceSha256 } });
  if (result.exitCode === 0) {
    const packages = (await readdir(buildRoot)).filter(p => p.endsWith('.pkg.tar.zst'));
    if (packages.length !== 1) throw new Error('ARCH_PACKAGE_COUNT_INVALID');
    const packagePath = join(buildRoot, packages[0]), extract = join(evidence, 'extracted'); await mkdir(extract);
    const unpack = await runCommand({ executable: 'bsdtar', args: ['-xf', packagePath, '-C', extract], cwd: buildRoot, env, evidence, name: 'extract' });
    const info = parsePackageInfo(await readFile(join(extract, '.PKGINFO'), 'utf8'));
    const inspected = await inspectArchTree(extract, info); await writeFile(join(evidence, 'inspection.json'), JSON.stringify({ ...inspected, info, packageSha256: sha256(await readFile(packagePath)), sourceSha256: input.sourceSha256 }, null, 2) + '\n');
    cases.push({ id: 'arch.inspection', required: true, status: inspected.valid && unpack.exitCode === 0 ? 'pass' : 'fail', environment, evidence: ['inspection.json', 'extract.log'], exitCode: inspected.valid && unpack.exitCode === 0 ? 0 : 1, cleanup: true, details: { package: packages[0] } });
  }
  for (const id of ['arch.clean-environment', 'arch.installed']) cases.push({ id, required: true, status: 'not_run', environment: 'approved disposable Arch guest required', evidence: ['approval-boundary.json'], exitCode: null, cleanup: null, details: { reason: 'No guest install/run/remove grant; host build is only a candidate.' } });
  await writeFile(join(evidence, 'approval-boundary.json'), JSON.stringify({ guestGrant: null, hostPackageInstallation: false, guestMutation: false, installedEvidence: 'not_run' }, null, 2) + '\n');
  await writeQualificationReport({ path: join(evidence, 'report.json'), runId: evidence.split('/').at(-1), environment, cases });
  return { cases, ready: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { 'build-root': { type: 'string' }, evidence: { type: 'string' } } }); if (!values['build-root'] || !values.evidence) throw new Error('ARCH_BUILD_ROOT_AND_EVIDENCE_REQUIRED');
  const result = await qualifyArch({ buildRoot: values['build-root'], evidence: values.evidence }); console.log(JSON.stringify(result, null, 2)); process.exitCode = 1;
}
