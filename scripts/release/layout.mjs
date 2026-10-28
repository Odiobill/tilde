import { readFile } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
export const installConfiguration = JSON.parse(await readFile(new URL('../../packaging/release/install-layout.json', import.meta.url), 'utf8'));
export function absolutePath(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path) || normalize(path) !== path || path === '/') throw new Error('INSTALL_PATH_INVALID');
  return path;
}
export function resolveLayout({ prefix, nodeExecutable }) {
  absolutePath(prefix); absolutePath(nodeExecutable);
  return { prefix, nodeExecutable, ...Object.fromEntries(Object.entries(installConfiguration.paths).map(([key, value]) => [key, join(prefix, value)])) };
}
export const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
export const systemdQuote = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', () => '$$') + '"';
// Exec arguments undergo desktop-entry string escaping followed by Exec escaping.
export const desktopQuote = value => '"' + value.replaceAll('\\', '\\\\\\\\').replaceAll('"', '\\\\"').replaceAll('`', '\\\\`').replaceAll('$', '\\\\$').replaceAll('%', '%%') + '"';
export function launchAssets(layout, { sourceDaemon } = {}) {
  // systemd forbids dollar characters in the executable token. env receives
  // the fixed absolute executable as an ordinary argument, with no PATH lookup.
  const command = sourceDaemon ? [layout.nodeExecutable, sourceDaemon] : [layout.daemonLauncher];
  const serviceCommand = ['/usr/bin/env', '--', ...command].map(systemdQuote).join(' ');
  return {
    serviceCommand, desktopCommand: desktopQuote(layout.gui),
    daemon: `#!/bin/sh\nexec ${shellQuote(layout.nodeExecutable)} ${shellQuote(join(layout.appRoot, 'apps/daemon/dist/main.js'))} "$@"\n`
  };
}
