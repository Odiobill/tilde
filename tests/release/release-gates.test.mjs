import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {evaluateQualification} from '../../scripts/release/gates.mjs';
const manifest=JSON.parse(await readFile('packaging/release/required-gates.json','utf8'));
const subject={sourceSha256:'a'.repeat(64),packageSha256:'b'.repeat(64)};
const clone=value=>JSON.parse(JSON.stringify(value));
function input(){return{manifest:clone(manifest),subject:{...subject},exceptions:[],reports:[{version:1,runId:'synthetic-format-fixture',environment:'Synthetic format fixture only',cases:manifest.gates.map(g=>({id:g.id,required:true,status:'pass',environment:'Synthetic format fixture only',evidence:['evidence.log'],evidenceSha256:{'evidence.log':'c'.repeat(64)},exitCode:0,cleanup:true,details:{syntheticFormatFixture:true},scope:{sourceSha256:subject.sourceSha256,...(g.packageBound?{packageSha256:subject.packageSha256}:{}),environment:g.environment}}))}]};}
test('missingRequiredRowBlocksRelease',()=>{const f=input();assert.equal(evaluateQualification(f).ready,true);f.reports[0].cases.pop();const r=evaluateQualification(f);assert.equal(r.ready,false);assert.ok(r.blockingIds.includes('manual.owner'));});
test('resultCannotDowngradeRequiredFlag',()=>{const f=input();f.reports[0].cases[0].required=false;f.reports[0].cases[0].status='not_run';f.reports[0].cases[0].exitCode=null;f.reports[0].cases[0].cleanup=null;assert.equal(evaluateQualification(f).ready,false);f.manifest.gates.pop();assert.equal(evaluateQualification(f).ready,false);});
test('cleanupFailureBlocks',()=>{const f=input();f.reports[0].cases[0].cleanup=false;assert.equal(evaluateQualification(f).ready,false);});
test('staleSourceOrExceptionBlocks',()=>{
 const f=input();const row=f.reports[0].cases.find(r=>r.id==='provider.local');row.status='not_run';row.exitCode=null;row.cleanup=null;
 const exception={version:1,id:row.id,environment:row.scope.environment,sourceSha256:subject.sourceSha256,packageSha256:subject.packageSha256,observedStatus:'not_run',ownerConfirmed:true,ownerStatement:'Synthetic format fixture only',scope:'Skip only this fixture target',ownerConfirmedAt:'2026-10-28T00:00:00Z'};
 f.exceptions=[exception];assert.equal(evaluateQualification(f).ready,true);
 for(const patch of [{sourceSha256:'d'.repeat(64)},{packageSha256:'d'.repeat(64)},{environment:'wrong-environment'},{ownerConfirmed:false},{ownerStatement:''},{observedStatus:'fail'}]){f.exceptions=[{...exception,...patch}];assert.equal(evaluateQualification(f).ready,false);}
 f.exceptions=[exception];f.reports[0].cases[0].scope.sourceSha256='d'.repeat(64);assert.equal(evaluateQualification(f).ready,false);
});
test('pendingRemoteCIIsNotLocallyExecuted',()=>{const r=evaluateQualification(input());assert.equal(r.ready,true);assert.equal(r.publicationReady,false);assert.equal(r.publicationPrerequisites[0].status,'not_run');assert.equal(r.publicationPrerequisites[0].locallyExecuted,false);});
test('manualAndReviewNeededForReadyStatus',()=>{for(const id of ['manual.owner','review.final']){const f=input();f.reports[0].cases=f.reports[0].cases.filter(row=>row.id!==id);assert.equal(evaluateQualification(f).ready,false);}});
test('duplicatesMalformedReportsAndCrossEnvironmentCannotPass',()=>{
 for(const mutate of [f=>f.reports.push(clone(f.reports[0])),f=>f.reports[0].cases[0].scope.environment='wrong',f=>f.reports[0].cases[0].evidence=[],f=>f.reports[0].cases[0].exitCode=1,f=>f.reports[0].cases[0].scope.sourceSha256='bad',f=>f.reports[0].version=999]){const f=input();mutate(f);assert.equal(evaluateQualification(f).ready,false);}
});
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {qualifyRelease} from '../../scripts/qualify-release.mjs';
test('onDiskReportEvidenceAndJsonCorruptionCannotPass',async t=>{
 const home=await mkdtemp('/tmp/tilde-gates-');t.after(()=>rm(home,{recursive:true,force:true}));const reports=join(home,'reports');await mkdir(reports,{mode:0o700});await mkdir(join(reports,'evidence'),{mode:0o700});
 const body='Synthetic evidence format fixture only\n',sha=createHash('sha256').update(body).digest('hex');await writeFile(join(reports,'evidence/fact.log'),body,{mode:0o600});
 const f=input();for(const row of f.reports[0].cases){row.evidence=['evidence/fact.log'];row.evidenceSha256={'evidence/fact.log':sha};}
 await writeFile(join(reports,'run.json'),JSON.stringify(f.reports[0]),{mode:0o600});await writeFile(join(home,'scope.json'),JSON.stringify(subject),{mode:0o600});
 const args={manifest:resolve('packaging/release/required-gates.json'),reports,scope:join(home,'scope.json')};assert.equal((await qualifyRelease({...args,output:join(home,'good.json')})).ready,true);
 await writeFile(join(reports,'evidence/fact.log'),'changed');assert.equal((await qualifyRelease({...args,output:join(home,'changed.json')})).ready,false);
 await writeFile(join(reports,'bad.json'),'{corrupt',{mode:0o600});const failed=await qualifyRelease({...args,output:join(home,'corrupt.json')});assert.equal(failed.ready,false);assert.ok(failed.errors.length>0);
});
