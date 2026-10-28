import { inspectRuntime } from './runtime.mjs';
try { console.log(JSON.stringify(await inspectRuntime(process.execPath, process.argv[2] || undefined, process.argv[3] || undefined))); }
catch (error) { console.error(error.code ?? 'NODE_INSPECTION_FAILED'); process.exitCode = 1; }
