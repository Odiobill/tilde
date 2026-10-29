import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {exportSource} from '../../scripts/export-source.mjs';import {assembleRelease} from '../../scripts/assemble-release.mjs';import {evaluateQualification} from '../../scripts/release/gates.mjs';
const api=await import('../../scripts/release/publication-assets.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const github=await import('../../scripts/release/github-evidence.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const verifier=await import('../../scripts/verify-published-release.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const publisher=await import('../../scripts/publish-release.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const home=await mkdtemp('/tmp/tilde-publication-');t.after(()=>rm(home,{recursive:true,force:true}));const root=join(home,'tree');await mkdir(root);
 const bodies={'packaging/arch/PKGBUILD':'# Synthetic recipe\nsource=@SOURCE_SHA256@\nqt=@QT_VERSION@\n','package.json':JSON.stringify({version:'0.1.1'}),LICENSE:'Synthetic MIT attribution\n','THIRD_PARTY_NOTICES.md':'Synthetic notices\n','docs/public/release-notes-0.1.1.md':'# Synthetic release notes\n','packaging/licenses/inventory.json':JSON.stringify({version:1,components:[],unresolved:[]})};
 bodies['packaging/release/public-files.json']=JSON.stringify({version:1,files:[...Object.keys(bodies),'packaging/release/public-files.json']});
 for(const [name,body] of Object.entries(bodies)){await mkdir(join(root,name,'..'),{recursive:true});await writeFile(join(root,name),body);}
 const source=join(home,'export'),exported=await exportSource({root,output:source,version:'0.1.1'}),pkg=join(home,'fixture.pkg');await writeFile(pkg,'Synthetic package transport fixture only');const packageSha256=sha(await readFile(pkg)),subject={sourceSha256:exported.sha256,packageSha256};
 const manifest=JSON.parse(await readFile('packaging/release/required-gates.json'));
 const input={manifest,subject,exceptions:[],reports:[{version:1,runId:'synthetic',environment:'synthetic',cases:manifest.gates.map(g=>({id:g.id,required:true,status:'pass',environment:'synthetic',evidence:['fact.log'],evidenceSha256:{'fact.log':'c'.repeat(64)},exitCode:0,cleanup:true,details:{synthetic:true},scope:{sourceSha256:subject.sourceSha256,...g.packageBound?{packageSha256}:{},environment:g.environment}}))}]};
 const qualificationPath=join(home,'qualification.json');await writeFile(qualificationPath,JSON.stringify(evaluateQualification(input)));
 const packageInspector=async()=>({valid:true,build:{recipeSha256:sha(bodies['packaging/arch/PKGBUILD'].replaceAll('@SOURCE_SHA256@',exported.sha256).replaceAll('@QT_VERSION@','6.12.0')),qtVersion:'6.12.0'},info:{name:'tilde-assistant',version:'0.1.1-1',architecture:'x86_64',dependencies:[]},notices:{LICENSE:sha(bodies.LICENSE),'THIRD_PARTY_NOTICES.md':sha(bodies['THIRD_PARTY_NOTICES.md']),'third-party/inventory.json':sha(bodies['packaging/licenses/inventory.json'])}});
 const baselineAssets=join(home,'baseline');await assembleRelease({source,package:pkg,qualification:qualificationPath,output:baselineAssets,packageInspector});
 const sourceRecord={version:1,repository:'Odiobill/tilde',tag:'v0.1.1',baselineCommit:'d'.repeat(40),canonicalArchiveSha256:exported.sha256,files:exported.files};
 const releaseNotesPath=join(home,'notes.md');await writeFile(releaseNotesPath,'# Tilde 0.1.1\n\nSource: https://github.com/Odiobill/tilde/tree/'+sourceRecord.baselineCommit+'\n');
 return{home,baselineAssets,qualificationPath,sourceRecord,releaseNotesPath,output:join(home,'public'),packageInspector,packageSha256};
}
function prepare(f){assert.equal(typeof api.preparePublicationAssets,'function','Missing no-source-archive publication behavior');return api.preparePublicationAssets(f);}
test('publicBundleOmitsSeparateSourceAndKeepsQualifiedBinary',async t=>{const f=await fixture(t),r=await prepare(f);assert.deepEqual((await readdir(f.output)).sort(),['LICENSE','THIRD_PARTY_NOTICES.md','license-inventory.json','qualification-summary.json','release-notes-0.1.1.md','source-identity.json','tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst'].sort());assert.equal(sha(await readFile(join(f.output,'tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst'))),f.packageSha256);assert.equal(r.localQualification.publicationReady,false);assert.equal(r.localQualification.ready,true);});
test('changedPackageOrPrivateQualificationCannotEnterPublicBundle',async t=>{for(const change of ['package','qualification','record']){const f=await fixture(t);if(change==='package')await writeFile(join(f.baselineAssets,'tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst'),'changed');if(change==='qualification'){const q=JSON.parse(await readFile(f.qualificationPath));q.errors=['SYNTHETIC_PRIVATE_CANARY'];await writeFile(f.qualificationPath,JSON.stringify(q));}if(change==='record')f.sourceRecord.files.pop();await assert.rejects(prepare(f));await assert.rejects(readdir(f.output),{code:'ENOENT'});}});
function remote(f){const baselineCommit=f.sourceRecord.baselineCommit,siteCommit='e'.repeat(40);return{version:1,repository:'Odiobill/tilde',baselineCommit,siteCommit,tagCommit:baselineCommit,baselineSourceSha256:f.sourceRecord.canonicalArchiveSha256,archSourceSha256:f.sourceRecord.canonicalArchiveSha256,runnerRemoved:true,runs:[['baseline-native','ci.yml',baselineCommit],['baseline-arch','arch.yml',baselineCommit],['site-native','ci.yml',siteCommit],['site','site.yml',siteCommit]].map(([role,workflow,headSha],i)=>({role,workflow,headSha,id:101+i,event:role==='baseline-arch'?'workflow_dispatch':'push',status:'completed',conclusion:'success',url:'https://github.com/Odiobill/tilde/actions/runs/'+(101+i),jobs:workflow==='ci.yml'?['native (22.19.0)','native (22.x)','native (24.x)'].map(name=>({name,status:'completed',conclusion:'success'})):[{name:workflow==='arch.yml'?'arch':'site',status:'completed',conclusion:'success'}]}))};}
function requireFeature(object,name){assert.equal(typeof object[name],'function','Missing checked publication behavior: '+name);return object[name];}
test('cancelledSkippedStaleAndUnrelatedCiCannotPromote',async t=>{const f=await fixture(t),good=remote(f),expected={repository:good.repository,baselineCommit:good.baselineCommit,siteCommit:good.siteCommit,sourceSha256:good.baselineSourceSha256};const validate=requireFeature(github,'validateRemoteEvidence');assert.equal(validate(good,expected).repository,'Odiobill/tilde');for(const mutate of [r=>r.runs[0].conclusion='cancelled',r=>r.runs[0].status='in_progress',r=>r.runs[0].jobs[0].conclusion='skipped',r=>r.runs[0].headSha=r.siteCommit,r=>r.runs[3].workflow='unrelated.yml',r=>r.tagCommit=r.siteCommit,r=>r.runnerRemoved=false,r=>r.runs[3].url='https://github.com/other/repo/actions/runs/104']){const r=structuredClone(good);mutate(r);assert.throws(()=>validate(r,expected),/REMOTE_EVIDENCE/);}});
async function publicationFixture(t){const f=await fixture(t);await prepare(f);const remoteEvidence=remote(f),siteCommit=remoteEvidence.siteCommit;const expectedCoreAssets=await Promise.all((await readdir(f.output)).map(async name=>({name,sha256:sha(await readFile(join(f.output,name)))})));const finalized=await requireFeature(api,'finalizePublicationAssets')({...f,coreAssets:f.output,remoteEvidence,siteCommit,expectedCoreAssets,output:join(f.home,'final')});return{...f,finalized,remoteEvidence,finalDir:join(f.home,'final')};}
async function transport(f){
 const files=await Promise.all((await readdir(f.finalDir)).sort().map(async(name,i)=>({name,id:i+1,bytes:await readFile(join(f.finalDir,name))})));const state={draft:true,writes:0,tag:f.sourceRecord.baselineCommit,extra:[],corrupt:null};
 const execute=async(cmd,args)=>{
  assert.equal(cmd,'gh');assert.equal(args[0],'api');const path=args[1];
  if(args.includes('--method')){assert.equal(path,'repos/Odiobill/tilde/releases/77');assert.equal(args[args.indexOf('--method')+1],'PATCH');assert.ok(args.includes('draft=false'));state.draft=false;state.writes++;return{stdout:JSON.stringify({id:77,draft:false})};}
  if(path==='repos/Odiobill/tilde/git/ref/tags/v0.1.1')return{stdout:JSON.stringify({ref:'refs/tags/v0.1.1',object:{type:'commit',sha:state.tag}})};
  if(path==='repos/Odiobill/tilde/actions/runners?per_page=100')return{stdout:JSON.stringify({total_count:0,runners:[]})};
  const run=f.remoteEvidence.runs.find(r=>path.startsWith('repos/Odiobill/tilde/actions/runs/'+r.id));
  if(run){if(path.includes('/jobs'))return{stdout:JSON.stringify({total_count:run.jobs.length,jobs:run.jobs.map((j,i)=>({...j,id:i+1,run_id:run.id}))})};return{stdout:JSON.stringify({id:run.id,path:'.github/workflows/'+run.workflow,repository:{full_name:'Odiobill/tilde'},head_sha:run.headSha,event:run.event,status:run.status,conclusion:run.conclusion,html_url:run.url})};}
  if(path==='repos/Odiobill/tilde/releases/tags/v0.1.1'||path==='repos/Odiobill/tilde/releases/77')return{stdout:JSON.stringify({id:77,name:api.publicationTitle,body:api.publicationBody(files.find(x=>x.name==='release-notes-0.1.1.md').bytes.toString(),f.remoteEvidence),tag_name:'v0.1.1',draft:state.draft,prerelease:true,tarball_url:'https://api.github.com/repos/Odiobill/tilde/tarball/v0.1.1',zipball_url:'https://api.github.com/repos/Odiobill/tilde/zipball/v0.1.1',assets:[...files.map(x=>({id:x.id,name:x.name,size:x.bytes.length,state:'uploaded',browser_download_url:'https://github.com/Odiobill/tilde/releases/download/v0.1.1/'+x.name})),...state.extra]})};
  const file=files.find(x=>path==='repos/Odiobill/tilde/releases/assets/'+x.id);if(file)return{stdout:state.corrupt===file.name?Buffer.from('changed bytes'):file.bytes};
  throw Error('Unexpected GitHub call: '+JSON.stringify(args));
 };return{execute,state,files};
}
test('finalPublicBundleHasNineFilesAndNoSeparateSourceArchive',async t=>{const f=await publicationFixture(t);assert.equal((await readdir(f.finalDir)).length,9);assert.equal(f.finalized.manifest.baselineCommit,f.sourceRecord.baselineCommit);assert.equal(f.finalized.manifest.siteCommit,f.remoteEvidence.siteCommit);assert.doesNotMatch(await readFile(join(f.finalDir,'SHA256SUMS'),'utf8'),/tilde-0\.1\.1\.tar\.gz/);});
test('privateDraftResolvesByIdWhenPublishedTagEndpointReturns404',async t=>{
 const f=await publicationFixture(t),io=await transport(f);let creates=0;
 const execute=async(cmd,args,options)=>{
  if(args[0]==='release'){creates++;throw Error('Duplicate draft creation');}
  const path=args[1];
  if(path==='repos/Odiobill/tilde/releases/tags/v0.1.1'&&io.state.draft){const e=Error('Published tag not found');e.stdout=JSON.stringify({status:'404'});throw e;}
  if(path==='repos/Odiobill/tilde/releases?per_page=100&page=1')return{stdout:JSON.stringify([{id:77,tag_name:'v0.1.1',draft:true}])};
  if(path==='repos/Odiobill/tilde/releases/77'&&!args.includes('--method'))return io.execute(cmd,['api','repos/Odiobill/tilde/releases/tags/v0.1.1'],options);
  return io.execute(cmd,args,options);
 };
 assert.equal((await verifier.verifyRelease({expectedManifest:f.finalized.expected,allowDraft:true,execute})).draft,true);
 assert.equal((await publisher.draftPublication({assets:f.finalDir,expected:f.finalized.expected,execute})).releaseId,77);
 assert.equal(creates,0);
 assert.equal((await publisher.publishPublication({releaseId:77,expected:f.finalized.expected,authorization:{approved:true,repository:'Odiobill/tilde',publicationManifestSha256:f.finalized.expected.publicationManifestSha256},execute})).draft,false);
 assert.equal(io.state.writes,1);
});
test('draftDiscoveryFailsClosedOnDeniedAmbiguousOrUnboundedLists',async()=>{
 for(const kind of ['denied','ambiguous','limit']){
  let pages=0;
  const execute=async(_cmd,args)=>{
   if(args[1].includes('/releases/tags/')){const e=Error('not found');e.stdout='{"status":"404"}';throw e;}
   assert.match(args[1],/releases\?per_page=100&page=\d+$/);pages++;
   if(kind==='denied'){const e=Error('denied');e.stdout='{"status":"403"}';throw e;}
   return{stdout:JSON.stringify(kind==='ambiguous'?[{id:77,tag_name:'v0.1.1'},{id:78,tag_name:'v0.1.1'}]:Array.from({length:100},(_,i)=>({id:i+1,tag_name:'other'})))};
  };
  await assert.rejects(github.readRelease({allowDraft:true,execute}),kind==='denied'?/GITHUB_READ_FAILED/:kind==='ambiguous'?/RELEASE_DISCOVERY_AMBIGUOUS/:/RELEASE_DISCOVERY_LIMIT/);
  assert.equal(pages,kind==='limit'?10:1);
 }
});
test('draftAssetUrlsAllowOneOwnedUntaggedPrefixAndRequireFinalPublishedUrls',async t=>{
 const f=await publicationFixture(t),io=await transport(f);let prefix='https://github.com/Odiobill/tilde/releases/download/untagged-c59d9ee1ec74103bd1c4/';
 const execute=async(cmd,args,options)=>{const result=await io.execute(cmd,args,options);if(args[1]==='repos/Odiobill/tilde/releases/77'){const r=JSON.parse(result.stdout);r.assets.forEach(a=>a.browser_download_url=prefix+a.name);return{stdout:JSON.stringify(r)};}return result;};
 assert.equal((await verifier.verifyRelease({expectedManifest:f.finalized.expected,allowDraft:true,execute})).assets.length,9);
 io.state.draft=false;await assert.rejects(verifier.verifyRelease({expectedManifest:f.finalized.expected,execute}),/PUBLICATION_BINDING/);
 io.state.draft=true;prefix='https://github.com/other/repo/releases/download/untagged-c59d9ee1ec74103bd1c4/';await assert.rejects(verifier.verifyRelease({expectedManifest:f.finalized.expected,allowDraft:true,execute}),/PUBLICATION_BINDING/);
});
test('changedDraftOrTagBlocksWritesAndValidPublicationIsIdempotent',async t=>{const f=await publicationFixture(t),io=await transport(f),expected=f.finalized.expected;const publish=requireFeature(publisher,'publishPublication');for(const change of ['tag','binary','source']){io.state.tag=change==='tag'?'f'.repeat(40):f.sourceRecord.baselineCommit;io.state.corrupt=change==='binary'?'tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst':null;io.state.extra=change==='source'?[{id:99,name:'tilde-0.1.1.tar.gz',size:1,state:'uploaded',browser_download_url:'https://github.com/Odiobill/tilde/releases/download/v0.1.1/tilde-0.1.1.tar.gz'}]:[];await assert.rejects(publish({releaseId:77,expected,authorization:{approved:true,repository:'Odiobill/tilde',publicationManifestSha256:expected.publicationManifestSha256},execute:io.execute}));assert.equal(io.state.writes,0);}io.state.extra=[];io.state.corrupt=null;const auth={approved:true,repository:'Odiobill/tilde',publicationManifestSha256:expected.publicationManifestSha256};assert.equal((await publish({releaseId:77,expected,authorization:auth,execute:io.execute})).draft,false);assert.equal(io.state.writes,1);await publish({releaseId:77,expected,authorization:auth,execute:io.execute});assert.equal(io.state.writes,1);});
test('releaseChecksRejectDuplicateChecksumsAndKeepAutomaticGitHubArchives',async t=>{const f=await publicationFixture(t),io=await transport(f),verify=requireFeature(verifier,'verifyRelease');assert.equal((await verify({expectedManifest:f.finalized.expected,allowDraft:true,execute:io.execute})).assets.length,9);const sums=io.files.find(x=>x.name==='SHA256SUMS');sums.bytes=Buffer.concat([sums.bytes,Buffer.from(sums.bytes.toString().split('\n')[0]+'\n')]);const expected=structuredClone(f.finalized.expected);delete expected.assets.find(x=>x.name==='SHA256SUMS').sha256;delete expected.assets.find(x=>x.name==='SHA256SUMS').size;await assert.rejects(verify({expectedManifest:expected,allowDraft:true,execute:io.execute}),/RELEASE_ASSET/);});
test('publicationManifestCannotBorrowSiteChecksFromAnotherCommit',async t=>{
 const f=await publicationFixture(t),path=join(f.finalDir,'publication-manifest.json'),m=JSON.parse(await readFile(path));m.ci.siteCommit='f'.repeat(40);for(const r of m.ci.runs)if(r.role==='site'||r.role==='site-native')r.headSha=m.ci.siteCommit;f.remoteEvidence=m.ci;await writeFile(path,JSON.stringify(m));
 const bytes=await readFile(path),expected=structuredClone(f.finalized.expected);expected.publicationManifestSha256=sha(bytes);Object.assign(expected.assets.find(a=>a.name==='publication-manifest.json'),{sha256:sha(bytes),size:bytes.length});const sums=expected.assets.filter(a=>a.name!=='SHA256SUMS').map(a=>a.sha256+'  '+a.name).join('\n')+'\n';await writeFile(join(f.finalDir,'SHA256SUMS'),sums);Object.assign(expected.assets.find(a=>a.name==='SHA256SUMS'),{sha256:sha(sums),size:Buffer.byteLength(sums)});const io=await transport(f);
 await assert.rejects(verifier.verifyRelease({expectedManifest:expected,allowDraft:true,execute:io.execute}),/REMOTE_EVIDENCE|RELEASE_ASSET/);
});
test('unexpectedLocalFilesCannotBeUploadedEvenToPrivateDraft',async t=>{
 const f=await publicationFixture(t),io=await transport(f),expected=structuredClone(f.finalized.expected);await writeFile(join(f.finalDir,'private.key'),'synthetic private canary');expected.assets.push({name:'private.key',sha256:sha('synthetic private canary'),size:Buffer.byteLength('synthetic private canary')});let uploads=0;
 const execute=async(cmd,args,options)=>{if(args[0]==='release'){uploads++;throw Error('unexpected upload');}if(args[1]==='repos/Odiobill/tilde/releases/tags/v0.1.1'){const e=Error('not found');e.stdout=JSON.stringify({status:'404'});throw e;}return io.execute(cmd,args,options);};
 await assert.rejects(publisher.draftPublication({assets:f.finalDir,expected,execute}));assert.equal(uploads,0);
});
test('lostGitHubReadPermissionCannotCreateOrPublish',async t=>{
 const f=await publicationFixture(t),io=await transport(f);let writes=0;
 const execute=async(cmd,args,options)=>{if(args[0]==='release'||args.includes('--method'))writes++;if(args[1]==='repos/Odiobill/tilde/releases/tags/v0.1.1'){const e=Error('HTTP 403: Resource not accessible');e.stderr='HTTP 403: Resource not accessible';throw e;}return io.execute(cmd,args,options);};
 await assert.rejects(publisher.draftPublication({assets:f.finalDir,expected:f.finalized.expected,execute}),/GITHUB_READ_FAILED/);
 await assert.rejects(publisher.publishPublication({releaseId:77,expected:f.finalized.expected,authorization:{approved:true,repository:'Odiobill/tilde',publicationManifestSha256:f.finalized.expected.publicationManifestSha256},execute}),/GITHUB_READ_FAILED/);assert.equal(writes,0);
});
test('assetMetadataChangedDuringVerificationBlocksPublication',async t=>{
 const f=await publicationFixture(t),io=await transport(f);let reads=0;
 const execute=async(cmd,args,options)=>{const result=await io.execute(cmd,args,options);if(args[1]==='repos/Odiobill/tilde/releases/77'&&++reads===2){const release=JSON.parse(result.stdout);release.assets[0].id=999;return{stdout:JSON.stringify(release)};}return result;};
 await assert.rejects(publisher.publishPublication({releaseId:77,expected:f.finalized.expected,authorization:{approved:true,repository:'Odiobill/tilde',publicationManifestSha256:f.finalized.expected.publicationManifestSha256},execute}),/PUBLICATION_BINDING/);assert.equal(io.state.writes,0);
});
test('changedReleaseNotesOrTitleBlockPublicationBeforeWrites',async t=>{
 for(const field of ['body','name']){
  const f=await publicationFixture(t),io=await transport(f);
  const execute=async(cmd,args,options)=>{const result=await io.execute(cmd,args,options);if(args[1]==='repos/Odiobill/tilde/releases/77'){const release=JSON.parse(result.stdout);release[field]='Unreviewed synthetic replacement';return{stdout:JSON.stringify(release)};}return result;};
  await assert.rejects(publisher.publishPublication({releaseId:77,expected:f.finalized.expected,authorization:{approved:true,repository:'Odiobill/tilde',publicationManifestSha256:f.finalized.expected.publicationManifestSha256},execute}),/PUBLICATION_BINDING/);assert.equal(io.state.writes,0);
 }
});
test('newDraftUploadsOnlyNineAssetsWithDeterministicVerifiedNotes',async t=>{
 const f=await publicationFixture(t),io=await transport(f);let created=false,uploads=[];
 const execute=async(cmd,args,options)=>{
  if(args[0]==='release'){
   assert.equal(args[1],'create');assert.equal(created,false);uploads=args.slice(-9);assert.deepEqual(uploads.map(p=>p.split('/').at(-1)),f.finalized.assets);
   const body=await readFile(args[args.indexOf('--notes-file')+1],'utf8');assert.equal(body,api.publicationBody(await readFile(join(f.finalDir,'release-notes-0.1.1.md'),'utf8'),f.remoteEvidence));
   assert.equal(args[args.indexOf('--title')+1],api.publicationTitle);assert.ok(!uploads.some(p=>p.endsWith('/release-body.md')||p.endsWith('.tar.gz')));
   for(const p of uploads)assert.equal(sha(await readFile(p)),f.finalized.expected.assets.find(a=>a.name===p.split('/').at(-1)).sha256);
   created=true;return{stdout:'https://github.com/Odiobill/tilde/releases/tag/v0.1.1'};
  }
  if(args[1]==='repos/Odiobill/tilde/releases?per_page=100&page=1')return{stdout:JSON.stringify([])};
  if(args[1]==='repos/Odiobill/tilde/releases/tags/v0.1.1'&&!created){const e=Error('not found');e.stdout=JSON.stringify({status:'404'});throw e;}
  return io.execute(cmd,args,options);
 };
 const result=await publisher.draftPublication({assets:f.finalDir,expected:f.finalized.expected,execute});assert.equal(created,true);assert.equal(uploads.length,9);assert.equal(result.draft,true);assert.equal(io.state.writes,0);
});
