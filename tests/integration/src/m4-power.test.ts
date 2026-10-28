import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {preparePowerState,recoverPowerState} from './m4-power-worker.js';
import {runCrashCase,crashCases} from './tools-crash.js';
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
