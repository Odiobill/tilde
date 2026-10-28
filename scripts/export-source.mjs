import { readFile, mkdir, lstat, realpath, readlink, symlink, writeFile } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { deniedPublicPath, publicTextProblems, checkPublicSource } from './check-public-source.mjs';
import { within, ownedPath, noSymlinkParents, sha256 } from './release/files.mjs';
export async function exportSource({ root, output, version }) {
  root = resolve(root); output = resolve(output);
  for (const name of ['package.json', 'packaging/release/public-files.json']) {
    const path = join(root, name); await noSymlinkParents(root, path);
    if (!(await lstat(path)).isFile()) throw new Error('EXPORT_INPUT_INVALID');
  }
  if (!/^\d+\.\d+\.\d+$/.test(version) || JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version !== version || within(output, root)) throw new Error('EXPORT_INPUT_INVALID');
  const manifest = JSON.parse(await readFile(join(root, 'packaging/release/public-files.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || new Set(manifest.files).size !== manifest.files.length) throw new Error('EXPORT_ALLOWLIST_INVALID');
  const records = [];
  // Validate every input before writing any public file; never scrub originals.
  for (const path of [...manifest.files].sort()) {
    ownedPath(path); if (deniedPublicPath(path)) throw new Error('EXPORT_PRIVATE_PATH');
    const input = join(root, path); await noSymlinkParents(root, input);
    const stat = await lstat(input);
    if (stat.isSymbolicLink()) {
      const target = await readlink(input), actual = await realpath(input), lexical = resolve(dirname(input), target);
      if (isAbsolute(target) || !within(root, actual) || !within(root, lexical) || !manifest.files.includes(relative(root, lexical))) throw new Error('EXPORT_UNSAFE_LINK');
      records.push({ path, type: 'symlink', target, mode: 0o777 });
    } else if (stat.isFile()) {
      const bytes = await readFile(input);
      if (publicTextProblems(path, bytes.toString('utf8')).length) throw new Error('PUBLIC_SOURCE_REJECTED');
      records.push({ path, type: 'file', bytes, mode: stat.mode & 0o111 ? 0o755 : 0o644, sha256: sha256(bytes) });
    } else throw new Error('EXPORT_SPECIAL_FILE');
  }
  await mkdir(output, { recursive: false, mode: 0o700 });
  const tree = join(output, `tilde-${version}`); await mkdir(tree, { mode: 0o755 });
  for (const record of records) {
    const destination = join(tree, record.path); await mkdir(dirname(destination), { recursive: true, mode: 0o755 });
    if (record.type === 'symlink') await symlink(record.target, destination);
    else await writeFile(destination, record.bytes, { flag: 'wx', mode: record.mode });
  }
  const check = await checkPublicSource(tree); if (!check.clean) throw Object.assign(new Error('PUBLIC_SOURCE_REJECTED'), { problems: check.problems });
  const archive = join(output, `tilde-${version}.tar.gz`);
  const tar = spawnSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--format=ustar', '-czf', archive, '-C', output, `tilde-${version}`], { encoding: 'utf8', timeout: 30000 });
  if (tar.error || tar.status !== 0) throw new Error('EXPORT_ARCHIVE_FAILED');
  const files = records.map(({ bytes, ...record }) => record), digest = sha256(await readFile(archive));
  await writeFile(join(output, 'source-manifest.json'), JSON.stringify({ version, archiveSha256: digest, files }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { tree, archive, sha256: digest, files };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { output: { type: 'string' }, version: { type: 'string' } } });
  if (!values.output || !values.version) throw new Error('EXPORT_OUTPUT_AND_VERSION_REQUIRED');
  const result = await exportSource({ root: resolve('.'), output: values.output, version: values.version }); console.log(JSON.stringify({ ...result, files: result.files.length }, null, 2));
}
