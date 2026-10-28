import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {validPerformanceGrant,qualifyPerformance} from '../../scripts/qualify-performance.mjs';
test('performanceScopeCannotReuseDesktopOrWrongBinaryGrant',()=>{
 const context={observed:{id:'fixture',uid:process.geteuid(),remote:false,type:'wayland'},evidence:'/private/fixture',binarySha256:'a'.repeat(64),now:1000};
 const grant={version:1,ownerApproved:true,ownerStatement:'Synthetic format fixture only',sessionId:'fixture',evidence:context.evidence,binarySha256:context.binarySha256,maxDurationMs:240000,expiresAt:new Date(2000).toISOString(),allowDesktopChanges:false,providerRequests:0};
 assert.equal(validPerformanceGrant(grant,context),true);
 for(const patch of [{ownerApproved:false},{ownerStatement:''},{sessionId:'other'},{evidence:'/different'},{binarySha256:'b'.repeat(64)},{maxDurationMs:240001},{expiresAt:new Date(999).toISOString()},{allowDesktopChanges:true},{providerRequests:1}])assert.equal(validPerformanceGrant({...grant,...patch},context),false);
 assert.equal(validPerformanceGrant(grant,{...context,observed:{...context.observed,remote:true}}),false);
});
test('nativePerformanceWithoutGrantRefusesBeforeAnyWindowOrUnit',async t=>{
 const home=await mkdtemp('/tmp/tilde-perf-refusal-');t.after(()=>rm(home,{recursive:true,force:true}));const evidence=join(home,'run');
 await assert.rejects(qualifyPerformance({evidence,mode:'native',root:resolve('.')}),/PERFORMANCE_NATIVE_GRANT_REQUIRED/);
 assert.deepEqual(await readdir(evidence),[]);
});
