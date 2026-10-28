import { lstat, mkdir, readdir, readFile, writeFile, readlink, symlink, chmod, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function within(root, path) { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'); }
export function ownedPath(path) { if (typeof path !== 'string' || !path || isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('OWNED_PATH_INVALID'); return path; }
export async function noSymlinkParents(root, path, includeLeaf = false) {
  if (!within(root, path)) throw new Error('INSTALL_ESCAPE');
  const parts = relative(root, includeLeaf ? path : dirname(path)).split('/').filter(Boolean);
  let current = root;
  for (const part of ['', ...parts]) {
    if (part) current = join(current, part);
    try { const stat = await lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink() || ![0, process.geteuid()].includes(stat.uid)) throw new Error('INSTALL_UNSAFE_PARENT'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
export async function put(root, path, bytes, mode = 0o644) {
  await noSymlinkParents(root, path); await mkdir(dirname(path), { recursive: true, mode: 0o755 });
  await writeFile(path, bytes, { flag: 'wx', mode });
}
export async function copyTree(input, output, { sourceScope, destinationRoot, filter = () => true }) {
  if (!filter(input)) return;
  const stat = await lstat(input);
  if (stat.isSymbolicLink()) {
    const target = await readlink(input);
    if (isAbsolute(target) || !within(sourceScope, await realpath(input)) || !within(destinationRoot, resolve(dirname(output), target))) throw new Error('INSTALL_UNSAFE_LINK');
    await noSymlinkParents(destinationRoot, output); await mkdir(dirname(output), { recursive: true, mode: 0o755 }); await symlink(target, output); return;
  }
  if (stat.isDirectory()) {
    await noSymlinkParents(destinationRoot, output, true); await mkdir(output, { recursive: true, mode: 0o755 });
    for (const name of (await readdir(input)).sort()) await copyTree(join(input, name), join(output, name), { sourceScope, destinationRoot, filter });
  } else if (stat.isFile()) await put(destinationRoot, output, await readFile(input), stat.mode & 0o111 ? 0o755 : 0o644);
  else throw new Error('INSTALL_SPECIAL_FILE');
}
export async function fileManifest(root, prefix = '') {
  const files = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = join(prefix, name), full = join(root, path), stat = await lstat(full);
    const mode = stat.mode & 0o777;
    if (stat.isSymbolicLink()) {
      const target = await readlink(full);
      if (isAbsolute(target) || !within(root, await realpath(full))) throw new Error('INSTALL_UNSAFE_LINK');
      files.push({ path, type: 'symlink', mode, target });
    } else if (stat.isDirectory()) { files.push({ path, type: 'directory', mode }); files.push(...await fileManifest(root, path)); }
    else if (stat.isFile()) files.push({ path, type: 'file', mode, sha256: sha256(await readFile(full)) });
    else throw new Error('INSTALL_SPECIAL_FILE');
  }
  return files;
}
