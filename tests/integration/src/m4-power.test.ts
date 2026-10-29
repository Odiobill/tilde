import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {join} from 'node:path';
import {preparePowerState,recoverPowerState} from './m4-power-worker.js';
import {runCrashCase,crashCases} from './tools-crash.js';
import * as powerWorker from './m4-power-worker.js';
import {untilTool} from './tool-fixtures.js';
test('effectReadinessWaitsForCompletedFsyncsRatherThanVisibleBytes',async t=>{
 const api=powerWorker as unknown as {waitForPowerShellEffect?:(work:string)=>Promise<void>};
 assert.equal(typeof api.waitForPowerShellEffect,'function');
 const home=await mkdtemp('/tmp/tilde-power-fsync-');t.after(()=>rm(home,{recursive:true,force:true}));
 const preload=join(home,'delay-fsync.cjs');
 await writeFile(preload,'const fs=require("node:fs"),original=fs.fsyncSync;let first=true;fs.fsyncSync=fd=>{if(first){first=false;fs.writeFileSync("fsync.waiting","waiting");while(!fs.existsSync("release-fsync"))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}return original(fd);};',{mode:0o600});
 const prefix="/usr/bin/node -e '";assert.ok(powerWorker.powerShellScript.startsWith(prefix)&&powerWorker.powerShellScript.endsWith("'"));
 const child=spawn(process.execPath,['--require',preload,'-e',powerWorker.powerShellScript.slice(prefix.length,-1)],{cwd:home,env:{PATH:'/usr/bin:/bin',HOME:home,LANG:'C.UTF-8'},stdio:'ignore'});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const end=once(child,'exit');child.kill('SIGTERM');await end;}});
 await untilTool(()=>readFile(join(home,'fsync.waiting'),'utf8').catch(()=>''),v=>v==='waiting');
 assert.equal(await readFile(join(home,'effect.log'),'utf8'),'effect\n','Bytes become visible before the blocked fsync completes');
 let ready=false;const waiting=api.waitForPowerShellEffect!(home).then(()=>{ready=true;});
 await delay(40);assert.equal(ready,false,'Do not acknowledge a visible but unflushed effect');
 await writeFile(join(home,'release-fsync'),'release',{mode:0o600});await waiting;assert.equal(ready,true);
 assert.equal(await readFile(join(home,'effect.log'),'utf8'),'effect\n');
});
for(const scenario of ['fresh-state','committed-state','pending-approval','budget-pause','catalog-ui'] as const){
 test('productStoragePrepareAndReopen:'+scenario,async t=>{
  const home=await mkdtemp('/tmp/tilde-m4-power-local-');t.after(()=>rm(home,{recursive:true,force:true}));
  const prepared=await preparePowerState(home,scenario);await prepared.close();
  const observed=await recoverPowerState(home,prepared.expected);assert.equal(observed.originalIdentities,true);assert.equal(observed.noRedispatch,true);assert.equal(observed.providerCalls,0);
  // This is an ordinary product-store reopen, never a guest-cut qualification.
 });
}
test('recoveryDoesNotRedispatchUnknownEffect',async()=>{
 const result=await runCrashCase(crashCases.find(c=>c.name==='shell-effect-no-exit-receipt')!) as {status?:unknown;effectCount?:unknown;cleanup:Record<string,boolean>};assert.equal(result.status,'outcome_unknown');assert.equal(result.effectCount,1);assert.ok(Object.values(result.cleanup).every(Boolean));
});
test('shellWorkerCannotRunWithoutSeparateExactFixtureScope',async t=>{
 const home=await mkdtemp('/tmp/tilde-m4-power-refusal-');t.after(()=>rm(home,{recursive:true,force:true}));
 // The CLI has an additional private guest/DMI/mount gate. The pure fixture API
 // refuses a shell before preparing any operation unless explicitly selected.
 await assert.rejects(preparePowerState(home,'owned-job'),/Separate exact synthetic shell-effect scope required/);
});
