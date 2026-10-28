import { spawnSync } from 'node:child_process';
import { inspectRuntime } from './release/runtime.mjs';
// npm initially starts this tiny bootstrap with PATH's Node; all product/build code
// runs with the validated explicit selection, including nested npm invocations.
try {
  const runtime = await inspectRuntime();
  const run = spawnSync(runtime.executable, process.argv.slice(2), { stdio: 'inherit', env: { ...process.env, TILDE_NODE: runtime.executable } });
  process.exitCode = run.status ?? 1;
} catch (error) { console.error(error.code ?? 'RUNTIME_START_FAILED'); process.exitCode = 1; }
