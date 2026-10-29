import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateWorkflow,checkWorkflows,validateReleaseInput} from '../../scripts/check-workflows.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
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
test('releaseVerifierRequiresManualIdentityAndCannotWrite',()=>{
 const release={on:{workflow_dispatch:{inputs:{publication_manifest_sha256:{required:true,type:'string'}}}},permissions:{contents:'read'},jobs:{verify:{if:"${{ github.event_name == 'workflow_dispatch' && github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}",'runs-on':'ubuntu-26.04','timeout-minutes':10,permissions:{contents:'read',actions:'read'},steps:[{run:'node scripts/verify-published-release.mjs --allow-draft'}]}}};
 assert.equal(validateWorkflow(release,{name:'release-draft.yml',pins}).valid,true);
 for(const mutate of [f=>f.on={push:{}},f=>delete f.on.workflow_dispatch.inputs.publication_manifest_sha256,f=>f.jobs.verify.permissions={contents:'write'},f=>f.jobs.verify.steps.push({run:'gh release create v0.1.1'}),f=>delete f.jobs.verify.if]){const f=clone(release);mutate(f);assert.equal(validateWorkflow(f,{name:'release-draft.yml',pins}).valid,false);}
});
test('artifactUploadCannotProvideSeparateSourceOrArbitraryJson',()=>{const f=fixture();f.jobs.native.steps.push({uses:'actions/upload-artifact@'+pins.actions.find(x=>x.repository==='actions/upload-artifact').commit,with:{path:'${{ runner.temp }}/source/tilde-0.1.1.tar.gz'}});assert.equal(validateWorkflow(f,{name:'ci.yml',pins}).valid,false);f.jobs.native.steps.at(-1).with.path='${{ runner.temp }}/private/settings.json';assert.equal(validateWorkflow(f,{name:'ci.yml',pins}).valid,false);f.jobs.native.steps.at(-1).with.path='${{ runner.temp }}/source/source-manifest.json';assert.equal(validateWorkflow(f,{name:'ci.yml',pins}).valid,true);});
test('allCurrentWorkflowsRespectThePublicationBoundary',async()=>{const r=await checkWorkflows();assert.equal(r.valid,true,JSON.stringify(r.problems));});

test('correctedReleaseIdentityAccepts011AndRejects010',()=>{
 const manifest={version:'0.1.1',archiveSha256:'a'.repeat(64),files:[{path:'package.json',sha256:'b'.repeat(64)}]};
 assert.equal(validateReleaseInput({version:'0.1.1',expectedSourceSha256:'a'.repeat(64),manifest}),true);
 assert.throws(()=>validateReleaseInput({version:'0.1.0',expectedSourceSha256:'a'.repeat(64),manifest:{...manifest,version:'0.1.0'}}),/RELEASE_IDENTITY_MISMATCH/);
});
