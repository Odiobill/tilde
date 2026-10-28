import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateWorkflow,checkWorkflows,validateReleaseInput} from '../../scripts/check-workflows.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
test('correctedReleaseIdentityAccepts011AndRejects010',()=>{
 const manifest={version:'0.1.1',archiveSha256:'a'.repeat(64),files:[{path:'package.json',sha256:'b'.repeat(64)}]};
 assert.equal(validateReleaseInput({version:'0.1.1',expectedSourceSha256:'a'.repeat(64),manifest}),true);
 assert.throws(()=>validateReleaseInput({version:'0.1.0',expectedSourceSha256:'a'.repeat(64),manifest:{...manifest,version:'0.1.0'}}),/RELEASE_IDENTITY_MISMATCH/);
});
const pins=JSON.parse(await readFile('packaging/release/actions.json','utf8'));
function fixture(){return{name:'fixture',on:{pull_request:{}},permissions:{contents:'read'},jobs:{native:{'runs-on':'ubuntu-26.04','timeout-minutes':30,steps:[{uses:'actions/checkout@'+pins.actions.find(x=>x.repository==='actions/checkout').commit,with:{'persist-credentials':false}},{run:'npm ci --ignore-scripts\nnpm run build\nnpm run typecheck\nnpm test\nnpm run test:release\nctest --test-dir .build/cmake --output-on-failure'}]}}};}
test('prJobsHaveNoPublishAuthority',()=>{
 const f=fixture();assert.equal(validateWorkflow(f,{name:'ci.yml',pins}).valid,true);
 for(const permission of [{contents:'write'},{'id-token':'write'},{pages:'write'}]){const changed=clone(f);changed.jobs.native.permissions=permission;assert.equal(validateWorkflow(changed,{name:'ci.yml',pins}).valid,false);}
 const target=clone(f);target.on={pull_request_target:{}};assert.equal(validateWorkflow(target,{name:'ci.yml',pins}).valid,false);
 const conditional=clone(f);conditional.jobs.native.steps[1].if='${{ false }}';assert.equal(validateWorkflow(conditional,{name:'ci.yml',pins}).valid,false);
 const expression=clone(f);expression.jobs.native.steps.push({run:'echo ${{ github.event.pull_request.title }}'});assert.equal(validateWorkflow(expression,{name:'ci.yml',pins}).valid,false);
});
test('actionsPinnedToVerifiedCommit',()=>{
 const f=fixture();for(const ref of ['actions/checkout@v7','actions/checkout@'+'1'.repeat(40),'forged/checkout@'+pins.actions[0].commit]){const changed=clone(f);changed.jobs.native.steps[0].uses=ref;assert.equal(validateWorkflow(changed,{name:'ci.yml',pins}).valid,false);}
});
test('releaseRequiresManualDispatchAndVersionIdentity',()=>{
 const manifest={version:'0.1.1',archiveSha256:'a'.repeat(64),files:[{path:'package.json',sha256:'b'.repeat(64)}]};
 assert.equal(validateReleaseInput({version:'0.1.1',expectedSourceSha256:'a'.repeat(64),manifest}),true);
 for(const change of [{version:'0.1.1;run'},{version:'0.2.0'},{expectedSourceSha256:'b'.repeat(64)},{manifest:{...manifest,files:[{path:'../private',sha256:'b'.repeat(64)}]}}])assert.throws(()=>validateReleaseInput({version:'0.1.1',expectedSourceSha256:'a'.repeat(64),manifest,...change}));
});
test('ciMissingNativeGateCannotBecomeReleasePass',async()=>{
 const workflows=await checkWorkflows();assert.equal(workflows.valid,true,JSON.stringify(workflows.problems));
 const release=JSON.parse(await readFile('.github/workflows/release-draft.yml','utf8'));
 for(const needs of [[],['identity'],['identity','arch']]){const changed=clone(release);changed.jobs.draft.needs=needs;assert.equal(validateWorkflow(changed,{name:'release-draft.yml',pins}).valid,false);}
 const changed=clone(release);changed.jobs.draft.steps.push({run:'gh release create v0.1.1'});assert.equal(validateWorkflow(changed,{name:'release-draft.yml',pins}).valid,false);
});
