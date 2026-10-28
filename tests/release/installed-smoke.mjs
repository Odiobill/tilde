import { mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { stageInstall } from '../../scripts/stage-install.mjs';
export async function installedSmoke() {
  const root = resolve('.'), directory = await mkdtemp(join(tmpdir(), 'tilde-installed-'));
  try {
    const home = join(directory, 'home'), prefix = join(directory, 'installed space " % $'), destdir = join(directory, 'stage');
    await mkdir(home, { mode: 0o700 }); await mkdir(join(home, 'run'), { mode: 0o700 }); await mkdir(prefix);
    await stageInstall({ root, destdir, prefix, nodeExecutable: process.execPath });
    const controller = join(directory, 'controller.mjs'); await cp(new URL('./installed-controller.mjs', import.meta.url), controller);
    const env = { PATH: '/usr/bin:/bin', HOME: home, XDG_RUNTIME_DIR: join(home, 'run'), XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'), XDG_CACHE_HOME: join(home, 'cache'), XDG_DATA_HOME: join(home, 'data'), QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software', ...(process.env.QT_QPA_PLATFORMTHEME ? { QT_QPA_PLATFORMTHEME: process.env.QT_QPA_PLATFORMTHEME } : {}) };
    // A recursive host-root bind maps root-owned ancestors to overflow UID 65534
    // in an unprivileged user namespace. A private root preserves the product's
    // same-UID/root directory checks instead of weakening them for the fixture.
    const args = ['--die-with-parent', '--unshare-net', '--tmpfs', '/', '--ro-bind', '/usr', '/usr', '--ro-bind', '/bin', '/bin', '--ro-bind', '/lib', '/lib', '--ro-bind-try', '/lib64', '/lib64', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/etc'];
    for (const path of ['/etc/fonts', '/etc/ld.so.cache', '/etc/passwd', '/etc/group', '/etc/machine-id']) args.push('--ro-bind', path, path);
    if (!process.execPath.startsWith('/usr/')) args.push('--ro-bind', dirname(process.execPath), dirname(process.execPath));
    args.push('--bind', directory, directory, '--ro-bind', join(destdir, prefix), prefix, '--chdir', prefix, 'dbus-run-session', '--', process.execPath, controller, prefix, root);
    const result = spawnSync('bwrap', args, { env, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('INSTALLED_SMOKE_FAILED:' + (result.error?.code ?? result.status) + ':' + result.stderr);
    return JSON.parse(result.stdout.trim().split('\n').at(-1));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await installedSmoke()));
