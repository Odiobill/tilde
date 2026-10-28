import { readFile, lstat, unlink, rmdir, readlink } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveLayout } from './release/layout.mjs';
import { noSymlinkParents, ownedPath, within, sha256 } from './release/files.mjs';
export async function uninstallStaged({ destdir, manifest }) {
  const layout = resolveLayout({ prefix: manifest.prefix, nodeExecutable: manifest.nodeExecutable }), root = join(resolve(destdir), layout.prefix);
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('INSTALL_MANIFEST_INVALID');
  await noSymlinkParents('/', root, true);
  if ((await lstat(resolve(destdir))).uid !== process.geteuid()) throw new Error('PRIVATE_DESTDIR_REQUIRED');
  const seen = new Set();
  for (const file of manifest.files) {
    ownedPath(file.path); if (seen.has(file.path)) throw new Error('INSTALL_MANIFEST_DUPLICATE'); seen.add(file.path);
    if (!['file', 'directory', 'symlink'].includes(file.type) || !Number.isInteger(file.mode)) throw new Error('INSTALL_MANIFEST_INVALID');
    if (file.type === 'file' && !/^[a-f0-9]{64}$/.test(file.sha256 ?? '') && file.path !== relative(layout.prefix, layout.manifest)) throw new Error('INSTALL_MANIFEST_DIGEST_MISSING');
    if (file.type === 'symlink' && (typeof file.target !== 'string' || isAbsolute(file.target) || !within(root, resolve(root, dirname(file.path), file.target)))) throw new Error('INSTALL_UNSAFE_LINK');
    await noSymlinkParents(root, join(root, file.path), file.type === 'directory');
  }
  const removed = [], preserved = [];
  const self = relative(layout.prefix, layout.manifest);
  const files = [...manifest.files].sort((a, b) => (a.path === self ? 1 : b.path === self ? -1 : b.path.length - a.path.length));
  for (const file of files.filter(f => f.type !== 'directory')) {
    const path = join(root, file.path); let stat; try { stat = await lstat(path); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const same = file.type === 'symlink' ? stat.isSymbolicLink() && await readlink(path) === file.target
      : stat.isFile() && stat.nlink === 1 && (stat.mode & 0o777) === file.mode && (file.sha256 ? sha256(await readFile(path)) === file.sha256 : await readFile(path, 'utf8') === JSON.stringify(manifest, null, 2) + '\n');
    if (!same) { preserved.push(file.path); continue; } await unlink(path); removed.push(file.path);
  }
  for (const file of files.filter(f => f.type === 'directory')) {
    try {
      const path = join(root, file.path), stat = await lstat(path);
      if (!stat.isDirectory() || (stat.mode & 0o777) !== file.mode) { preserved.push(file.path); continue; }
      await rmdir(path); removed.push(file.path);
    } catch (error) { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; }
  }
  return { removed, preserved };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { destdir: { type: 'string' }, manifest: { type: 'string' } } });
  if (!values.destdir || !values.manifest) throw new Error('DESTDIR_AND_MANIFEST_REQUIRED');
  console.log(JSON.stringify(await uninstallStaged({ destdir: resolve(values.destdir), manifest: JSON.parse(await readFile(values.manifest, 'utf8')) })));
}
