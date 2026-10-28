// Runs inside the isolated mount/network namespace with only installed product code.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConnection } from 'node:net';
import assert from 'node:assert/strict';
const [prefix, hiddenRoot] = process.argv.slice(2), home = process.env.HOME;
const socket = join(process.env.XDG_RUNTIME_DIR, 'tilde/agent.sock');
let daemon, gui, helper, client;
async function ready(child, event) {
  return new Promise((resolve, reject) => {
    let buffer = '', diagnostic = '';
    const timer = setTimeout(() => finish(new Error('INSTALLED_READY_TIMEOUT:' + event + ':' + diagnostic)), 10000);
    const exit = () => finish(new Error('INSTALLED_PROCESS_EXIT:' + event + ':' + diagnostic));
    const data = bytes => {
      buffer += bytes.toString();
      for (const line of buffer.split('\n').slice(0, -1)) {
        try { const value = JSON.parse(line); if (value.event === event) return finish(undefined, value); } catch {}
      }
      buffer = buffer.split('\n').at(-1);
    };
    function finish(error, value) { clearTimeout(timer); child.stdout.off('data', data); child.off('exit', exit); error ? reject(error) : resolve(value); }
    child.stdout.on('data', data); child.stderr.on('data', b => { diagnostic = (diagnostic + b.toString()).slice(-1024); }); child.once('exit', exit); child.once('error', finish);
  });
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const end = once(child, 'exit'); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 1500);
  try { await end; } finally { clearTimeout(timer); }
}
function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = String(Math.random()); let buffer = '';
    const timer = setTimeout(() => finish(new Error('INSTALLED_IPC_TIMEOUT')), 5000);
    const data = bytes => { buffer += bytes.toString(); const lines = buffer.split('\n'); buffer = lines.pop(); for (const line of lines) { const value = JSON.parse(line); if (value.id === id) finish(undefined, value); } };
    function finish(error, value) { clearTimeout(timer); client.off('data', data); error ? reject(error) : resolve(value); }
    client.on('data', data); client.write(JSON.stringify({ v: 4, id, method, params }) + '\n');
  });
}
try {
  await assert.rejects(readFile(join(hiddenRoot, 'package.json')), { code: 'ENOENT' });
  const app = join(prefix, 'lib/tilde/app');
  const { desktopExecutables } = await import(pathToFileURL(join(app, 'apps/daemon/dist/desktop-bridge.js')));
  assert.equal(desktopExecutables.helper, join(prefix, 'lib/tilde/tilde-desktop-bridge'));
  assert.equal(desktopExecutables.frontend, join(prefix, 'bin/tilde-gui'));
  for (const [program, args] of [['desktop-file-validate', [join(prefix, 'share/applications/tilde-gui.desktop')]], ['systemd-analyze', ['--user', 'verify', join(prefix, 'lib/systemd/user/tilde-agentd.service')]]]) {
    const checked = spawnSync(program, args, { encoding: 'utf8', timeout: 5000 });
    assert.equal(checked.status, 0, program + ':' + checked.stderr + checked.stdout);
  }
  daemon = spawn(join(prefix, 'bin/tilde-agentd'), [], { stdio: ['ignore', 'pipe', 'pipe'] });
  await ready(daemon, 'ready');
  client = createConnection(socket); await once(client, 'connect');
  const hello = await request('system.hello'); assert.equal(hello.ok, true);
  assert.equal(hello.result.settings.credential.configured, false);
  const view = await request('conversation.get', { conversationId: hello.result.rootConversationId }); assert.equal(view.ok, true); assert.equal(view.result.chat.rows.length, 0);
  helper = spawn(desktopExecutables.helper, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const availability = await ready(helper, 'ready'); assert.equal(availability.available, false);
  helper.stdin.end(); await once(helper, 'exit'); assert.equal(helper.exitCode, 0);
  const args = ['--socket', socket, '--outbox', join(home, 'outbox.json'), '--activation', join(home, 'activation.sock')];
  gui = spawn(desktopExecutables.frontend, args, { stdio: ['ignore', 'pipe', 'pipe'] }); await ready(gui, 'window_ready');
  const again = spawnSync(desktopExecutables.frontend, args, { encoding: 'utf8', timeout: 5000 }); assert.equal(again.status, 0, again.stderr);
  await stop(gui); assert.equal(daemon.exitCode, null); assert.equal(daemon.signalCode, null);
  assert.equal((await request('conversation.get', { conversationId: hello.result.rootConversationId })).result.chat.rows.length, 0);
  client.destroy(); await stop(daemon);
  console.log(JSON.stringify({ cleanup: true, installedDaemon: true, installedGui: true, installedHelper: true, activationOnly: true, newProviderRequests: 0, originalCheckoutHidden: true, validators: { desktopFile: 0, systemdUnit: 0 }, nodeVersion: process.versions.node }));
} finally { client?.destroy(); await stop(gui); await stop(helper); await stop(daemon); }
