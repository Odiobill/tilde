import { mkdir, readFile, writeFile, symlink, lstat, readdir } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { resolveLayout, installConfiguration as config, launchAssets, absolutePath } from './release/layout.mjs';
import { noSymlinkParents, put, copyTree, fileManifest, ownedPath } from './release/files.mjs';

export async function stageInstall({ root, destdir, prefix, nodeExecutable }) {
  root = resolve(root); destdir = absolutePath(destdir);
  const layout = resolveLayout({ prefix, nodeExecutable });
  await noSymlinkParents('/', destdir, true); await mkdir(destdir, { recursive: true, mode: 0o700 });
  if ((await lstat(destdir)).uid !== process.geteuid()) throw new Error('PRIVATE_DESTDIR_REQUIRED');
  const target = join(destdir, prefix); await noSymlinkParents(destdir, target, true);
  try { if ((await readdir(target)).length) throw new Error('INSTALL_PREFIX_NOT_EMPTY'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(target, { recursive: true, mode: 0o755 });
  const at = final => join(destdir, final), app = at(layout.appRoot);
  await mkdir(app, { recursive: true, mode: 0o755 });
  await put(target, join(app, 'package.json'), JSON.stringify({ name: 'tilde-installed', version: '0.1.1', private: true, type: 'module' }, null, 2) + '\n');
  const productFilter = path => !path.endsWith('.test.js') && !path.endsWith('.d.ts') && !path.endsWith('.map') && !path.split('/').includes('fixtures');
  for (const workspace of config.workspaces) {
    await put(target, join(app, workspace, 'package.json'), await readFile(join(root, workspace, 'package.json')));
    await copyTree(join(root, workspace, 'dist'), join(app, workspace, 'dist'), { sourceScope: root, destinationRoot: target, filter: productFilter });
  }
  for (const addon of config.addons) await put(target, join(app, addon), await readFile(join(root, addon)));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!path.startsWith('node_modules/') || entry.dev) continue;
    ownedPath(path);
    if (entry.link) {
      if (!config.workspaces.includes(entry.resolved)) continue;
      const out = join(app, path); await mkdir(dirname(out), { recursive: true, mode: 0o755 });
      await symlink(relative(dirname(out), join(app, entry.resolved)), out);
    } else {
      await copyTree(join(root, path), join(app, path), { sourceScope: join(root, 'node_modules'), destinationRoot: target,
        filter: input => !relative(join(root, path), input).split('/').includes('node_modules') });
    }
  }
  const constants = `export const installedExecutables = Object.freeze(${JSON.stringify({ helper: layout.helper, frontend: layout.gui })});\n`;
  // Only the new staged module is replaced; the development source is untouched.
  await writeFile(join(app, 'apps/daemon/dist/install-paths.js'), constants, { mode: 0o644 });
  // CMake performs the native install fixups (including replacing build RPATHs).
  // Source staging and makepkg consume the same destinations from the manifest.
  const nativeInstall = spawnSync(process.env.TILDE_CMAKE ?? 'cmake', ['--install', join(root, '.build/cmake'), '--prefix', prefix, '--component', 'Runtime'], {
    env: { ...process.env, DESTDIR: destdir }, encoding: 'utf8', timeout: 30000
  });
  if (nativeInstall.error || nativeInstall.status !== 0) throw new Error('INSTALL_NATIVE_FAILED:' + (nativeInstall.error?.code ?? nativeInstall.stderr));
  const assets = launchAssets(layout);
  await put(target, at(layout.daemonLauncher), assets.daemon, 0o755);
  for (const [template, destination, values] of [
    ['systemd/tilde-agentd.service.in', layout.userUnit, { EXEC: assets.serviceCommand }],
    ['desktop/tilde-gui.desktop.in', layout.desktopEntry, { GUI: assets.desktopCommand }]
  ]) {
    const text = (await readFile(join(root, 'packaging', template), 'utf8')).replace(/@(EXEC|GUI)@/g, (_, key) => values[key]);
    await put(target, at(destination), text);
  }
  await put(target, at(layout.icon), await readFile(join(root, 'packaging/icons/tilde-gui.svg')));
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    try { await put(target, join(at(layout.licenses), file), await readFile(join(root, file))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  try { await copyTree(join(root, 'packaging/licenses'), join(at(layout.licenses), 'third-party'), { sourceScope: root, destinationRoot: target }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await copyTree(join(root, 'docs/public'), at(layout.docs), { sourceScope: root, destinationRoot: target }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(at(layout.manifest)), { recursive: true, mode: 0o755 });
  const files = await fileManifest(target);
  files.push({ path: relative(prefix, layout.manifest), type: 'file', mode: 0o644 });
  const manifest = { version: 1, prefix, nodeExecutable, files, executables: { helper: layout.helper, frontend: layout.gui } };
  await put(target, at(layout.manifest), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { destdir: { type: 'string' }, prefix: { type: 'string', default: '/usr' }, node: { type: 'string', default: process.execPath } } });
  if (!values.destdir) throw new Error('PRIVATE_DESTDIR_REQUIRED');
  const manifest = await stageInstall({ root: resolve('.'), destdir: resolve(values.destdir), prefix: values.prefix, nodeExecutable: values.node });
  console.log(JSON.stringify({ version: 1, files: manifest.files.length, prefix: manifest.prefix }));
}
