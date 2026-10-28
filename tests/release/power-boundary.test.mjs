import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {qualifyPower,powerCases} from '../../scripts/qualify-power.mjs';
test('missingPowerGrantCannotBecomeStorageLossPass',async t=>{
 const home=await mkdtemp('/tmp/tilde-power-report-');t.after(()=>rm(home,{recursive:true,force:true}));const evidence=join(home,'evidence');
 const row=await qualifyPower({evidence});assert.equal(row.required,true);assert.equal(row.status,'not_run');assert.equal(row.cleanup,null);
 const boundary=JSON.parse(await readFile(join(evidence,'operator-boundary.json'),'utf8'));assert.equal(boundary.cuts,0);assert.equal(boundary.guestBooted,false);assert.equal(boundary.hostBlockDeviceOpened,false);assert.deepEqual(boundary.requiredCases,powerCases);
});
test('unapprovedPowerGrantRefusesBeforeAnyGuestCaseDirectory',async t=>{
 const home=await mkdtemp('/tmp/tilde-power-refusal-');t.after(()=>rm(home,{recursive:true,force:true}));const evidence=join(home,'evidence'),grant=join(home,'grant.json');
 await writeFile(grant,JSON.stringify({version:1,ownerApproved:false}),{mode:0o600});
 const row=await qualifyPower({grant,case:'negative-control',evidence});assert.equal(row.status,'fail');assert.notEqual(row.exitCode,0);assert.ok(!(await readdir(evidence)).includes('negative-control'));
});
