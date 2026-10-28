import { spawn } from 'node:child_process';
import { open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// No shell, exclusive evidence files, finite wall deadline, owned child group only.
export async function runCommand({ executable, args, cwd, env, evidence, name, timeout = 300000 }) {
  const log = await open(join(evidence, `${name}.log`), 'wx', 0o600);
  const startedAt = new Date().toISOString();
  let timedOut = false, errorCode;
  const child = spawn(executable, args, { cwd, env, stdio: ['ignore', log.fd, log.fd], detached: true });
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeout);
  const exitCode = await new Promise(resolve => {
    child.once('error', error => { errorCode = error.code; resolve(null); });
    child.once('close', code => resolve(code));
  });
  clearTimeout(timer); await log.sync(); await log.close();
  const record = { executable, args, startedAt, finishedAt: new Date().toISOString(), exitCode, timedOut, ...(errorCode ? { errorCode } : {}) };
  await writeFile(join(evidence, `${name}.command.json`), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return record;
}
