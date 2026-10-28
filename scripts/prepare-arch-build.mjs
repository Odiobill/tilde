import { readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { sha256 as digest } from './release/files.mjs';
import { supportedVersion } from './release/runtime.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function prepareArchBuild({ source, sha256, output, npmCache }) {
  source = resolve(source); output = resolve(output);
  if (!/^[a-f0-9]{64}$/.test(sha256) || (await stat(source)).size > 64 * 1024 * 1024 || digest(await readFile(source)) !== sha256) throw new Error('SOURCE_DIGEST_MISMATCH');
  const archive = spawnSync('python3', [join(root, 'scripts/release/archive-input.py'), source, 'tilde-0.1.1'], { encoding: 'utf8', timeout: 10000 });
  if (archive.status !== 0 || archive.error) throw new Error('SOURCE_ARCHIVE_INVALID');
  const node = spawnSync('/usr/bin/node', ['-p', 'process.versions.node'], { encoding: 'utf8', timeout: 5000 });
  const qt = spawnSync('qmake6', ['-query', 'QT_VERSION'], { encoding: 'utf8', timeout: 5000 });
  if (node.status !== 0 || !supportedVersion(node.stdout.trim()) || qt.status !== 0 || !/^6\.\d+\.\d+$/.test(qt.stdout.trim())) throw new Error('ARCH_TOOLCHAIN_UNAVAILABLE');
  await mkdir(output, { recursive: false, mode: 0o700 });
  const recipe = (await readFile(join(root, 'packaging/arch/PKGBUILD'), 'utf8')).replaceAll('@SOURCE_SHA256@', sha256).replaceAll('@QT_VERSION@', qt.stdout.trim());
  await writeFile(join(output, 'PKGBUILD'), recipe, { mode: 0o644, flag: 'wx' });
  await cp(source, join(output, 'tilde-0.1.1.tar.gz'));
  if (npmCache) await cp(join(resolve(npmCache), '_cacache'), join(output, 'npm-cache/_cacache'), { recursive: true });
  const metadata = { version: 1, source: 'tilde-0.1.1.tar.gz', sourceSha256: sha256, recipeSha256: digest(Buffer.from(recipe)), packageName: 'tilde-assistant', packageVersion: '0.1.1-1', nodeVersion: node.stdout.trim(), qtVersion: qt.stdout.trim(), npmCache: npmCache ? 'npm-cache' : null, networkDuringBuild: false, kind: 'local-build-candidate', cleanArchGuestQualified: false, installedQualified: false };
  await writeFile(join(output, 'build-input.json'), JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return metadata;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { source: { type: 'string' }, sha256: { type: 'string' }, output: { type: 'string' }, 'npm-cache': { type: 'string' } } });
  if (!values.source || !values.sha256 || !values.output) throw new Error('SOURCE_DIGEST_OUTPUT_REQUIRED');
  console.log(JSON.stringify(await prepareArchBuild({ ...values, npmCache: values['npm-cache'] }), null, 2));
}
