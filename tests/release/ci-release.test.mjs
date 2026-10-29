import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {assembleCiDraft,publishDraft,releaseIdentity} from '../../scripts/ci-release.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
async function fixture(t){
 const home=await mkdtemp('/tmp/tilde-ci-draft-');t.after(()=>rm(home,{recursive:true,force:true}));const inputs=join(home,'inputs');await mkdir(join(inputs,'source'),{recursive:true});await mkdir(join(inputs,'arch'));
 const archive=Buffer.from('Synthetic archive-binding fixture; not a real source distribution'),pkg=Buffer.from('Synthetic package-binding fixture; not an ELF package');
 const manifest={version:'0.1.1',archiveSha256:sha(archive),files:[{path:'package.json',sha256:'a'.repeat(64)}]};
 for(const directory of ['source','arch']){await writeFile(join(inputs,directory,'source-manifest.json'),JSON.stringify(manifest));await writeFile(join(inputs,directory,'tilde-0.1.1.tar.gz'),archive);}
 await writeFile(join(inputs,'arch/tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst'),pkg);
 const env={RELEASE_VERSION:'0.1.1',SOURCE_SHA256:sha(archive),GITHUB_SHA:'c'.repeat(40),GITHUB_REPOSITORY:'synthetic/fixture',GITHUB_EVENT_NAME:'workflow_dispatch',GH_TOKEN:'synthetic-token-never-used-on-network'};
 await writeFile(join(inputs,'arch/arch-build-manifest.json'),JSON.stringify({version:'0.1.1',sourceSha256:sha(archive),githubCommit:env.GITHUB_SHA,build:'pass',inspection:'pass',readiness:'verification_pending'}));
 await writeFile(join(inputs,'arch/arch-inspection.json'),JSON.stringify({valid:true,sourceSha256:sha(archive),packageSha256:sha(pkg)}));
 return{home,inputs,output:join(home,'assets'),env};
}
test('ciCandidateNeverClaimsLocalReleaseReady',async t=>{
 const f=await fixture(t),manifest=await assembleCiDraft(f);assert.equal(manifest.readiness,'verification_pending');assert.match(manifest.requiredLocalQualification,/not supplied to CI/);
 const calls=[];await publishDraft({assets:f.output,env:f.env,execute:async(cmd,args)=>{calls.push({cmd,args});return{stdout:args[0]==='api'?JSON.stringify({object:{type:'commit',sha:f.env.GITHUB_SHA}}):''};}});
 const write=calls.find(c=>c.args[0]==='release');assert.ok(write);assert.ok(write.args.includes('--draft'));assert.ok(write.args.includes('--verify-tag'));assert.ok(!write.args.includes('--target'));assert.ok(write.args.includes('synthetic/fixture'));
});
test('draftRejectsWrongSourceTagAndPartialChecksums',async t=>{
 const f=await fixture(t);await assert.rejects(assembleCiDraft({...f,env:{...f.env,SOURCE_SHA256:'d'.repeat(64)}}));await assembleCiDraft(f);
 let writes=0;const execute=async(_cmd,args)=>{if(args[0]==='release')writes++;return{stdout:JSON.stringify({object:{type:'commit',sha:f.env.GITHUB_SHA}})};};
 await assert.rejects(publishDraft({assets:f.output,env:{...f.env,GITHUB_EVENT_NAME:'pull_request'},execute}));
 const sums=await readFile(join(f.output,'SHA256SUMS'),'utf8');await writeFile(join(f.output,'SHA256SUMS'),sums.split('\n').slice(1).join('\n'));
 await assert.rejects(publishDraft({assets:f.output,env:f.env,execute}),/DRAFT_ASSET_CHECKSUM_MISSING/);assert.equal(writes,0);
 await writeFile(join(f.output,'SHA256SUMS'),sums);
 await assert.rejects(publishDraft({assets:f.output,env:f.env,execute:async()=>({stdout:JSON.stringify({object:{type:'commit',sha:'e'.repeat(40)}})})}),/RELEASE_TAG_COMMIT_MISMATCH/);
});
