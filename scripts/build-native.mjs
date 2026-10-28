import { spawnSync } from 'node:child_process';
import { inspectRuntime, nativeConfigureArgs } from './release/runtime.mjs';
const runtime = await inspectRuntime();
const cmake = process.env.TILDE_CMAKE ?? 'cmake';
for(const args of [['--version'], nativeConfigureArgs(runtime), ['--build','.build/cmake','-j','4']]){
 const run=spawnSync(cmake,args,{stdio:'inherit'});if(run.error||run.status!==0)process.exit(run.status??1);
}
