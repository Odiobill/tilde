import { inspectRuntime } from './release/runtime.mjs';
import { resolveLayout, installConfiguration, launchAssets } from './release/layout.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const runtime = await inspectRuntime();
const layout = { ...resolveLayout({ prefix: resolve('.'), nodeExecutable: runtime.executable }), gui: resolve(installConfiguration.build.gui), helper: resolve(installConfiguration.build.helper) };
const assets = launchAssets(layout, { sourceDaemon: resolve('apps/daemon/dist/main.js') });
await mkdir('.build/packaging', { recursive: true });
for (const [input, output] of [['packaging/systemd/tilde-agentd.service.in', 'tilde-agentd.service'], ['packaging/desktop/tilde-gui.desktop.in', 'tilde-gui.desktop']]) {
  const values = { EXEC: assets.serviceCommand, GUI: assets.desktopCommand };
  const text = (await readFile(input, 'utf8')).replace(/@(EXEC|GUI)@/g, (_, key) => values[key]);
  await writeFile('.build/packaging/' + output, text, { mode: 0o600 });
}
await writeFile('.build/packaging/desktop-runtime.json', JSON.stringify({ version: 1, helper: layout.helper, frontend: layout.gui }, null, 2) + '\n', { mode: 0o600 });
console.log('Generated source launch files under .build/packaging; nothing installed.');
