import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {exportSource} from '../../scripts/export-source.mjs';import {assembleRelease} from '../../scripts/assemble-release.mjs';import {evaluateQualification} from '../../scripts/release/gates.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const home=await mkdtemp('/tmp/tilde-assembly-');t.after(()=>rm(home,{recursive:true,force:true}));const root=join(home,'source');await mkdir(root);
 const bodies={'packaging/arch/PKGBUILD':"# Synthetic recipe\nsource=@SOURCE_SHA256@\nqt=@QT_VERSION@\n",'package.json':JSON.stringify({version:'0.1.0'}),LICENSE:'Synthetic MIT attribution fixture\n','THIRD_PARTY_NOTICES.md':'Synthetic notice fixture\n','docs/public/release-notes-0.1.0.md':'# Synthetic candidate notes\n','packaging/licenses/inventory.json':JSON.stringify({version:1,components:[],unresolved:[]})};
 const files=[...Object.keys(bodies),'packaging/release/public-files.json'];bodies['packaging/release/public-files.json']=JSON.stringify({version:1,files});
 for(const [name,body] of Object.entries(bodies)){await mkdir(join(root,name,'..'),{recursive:true});await writeFile(join(root,name),body,{mode:0o644});}
 const exported=await exportSource({root,output:join(home,'export'),version:'0.1.0'}),pkg=join(home,'synthetic.pkg');await writeFile(pkg,'Synthetic opaque package transport fixture; no package validity claim',{mode:0o600});
 const subject={sourceSha256:exported.sha256,packageSha256:sha(await readFile(pkg))},manifest=JSON.parse(await readFile('packaging/release/required-gates.json','utf8'));
 const qualification=join(home,'qualification.json');await writeFile(qualification,JSON.stringify(evaluateQualification({manifest,subject,reports:[],exceptions:[]})),{mode:0o600});
 // The real package inspector is independently exercised against actual makepkg
 // artifacts. This injection tests assembly identity/allowlisting only.
 const packageInspector=async()=>({valid:true,build:{recipeSha256:sha(bodies['packaging/arch/PKGBUILD'].replaceAll('@SOURCE_SHA256@',exported.sha256).replaceAll('@QT_VERSION@','6.12.0')),qtVersion:'6.12.0'},info:{name:'tilde-assistant',version:'0.1.0-1',architecture:'x86_64',dependencies:[]},notices:{LICENSE:sha(bodies.LICENSE),'THIRD_PARTY_NOTICES.md':sha(bodies['THIRD_PARTY_NOTICES.md']),'third-party/inventory.json':sha(bodies['packaging/licenses/inventory.json'])}});
 return{home,source:join(home,'export'),package:pkg,qualification,output:join(home,'assets'),packageInspector};
}
test('noPrivateFilesInArtifacts',async t=>{
 const f=await fixture(t),result=await assembleRelease(f);assert.equal(result.readiness,'verification_pending');const files=await readdir(f.output);assert.deepEqual(files.sort(),result.assets.sort());
 for(const name of files.filter(n=>n.endsWith('.json'))){const content=await readFile(join(f.output,name),'utf8');assert.ok(!content.includes(f.home));assert.doesNotMatch(content,/ownerStatement|\.superpowers|evidenceSha256/);}
 assert.equal(JSON.parse(await readFile(join(f.output,'qualification-summary.json'),'utf8')).blockingIds.length,21);
});
test('assemblyRejectsStaleOrInventedReadinessAndSourceBytes',async t=>{
 const f=await fixture(t),report=JSON.parse(await readFile(f.qualification,'utf8'));report.ready=true;report.readiness='ready';report.outcomes=[];report.blockingIds=[];await writeFile(f.qualification,JSON.stringify(report));
 const built=await assembleRelease(f);assert.equal(built.readiness,'verification_pending');
 const wrong=await fixture(t);const stale=JSON.parse(await readFile(wrong.qualification,'utf8'));stale.subject.sourceSha256='d'.repeat(64);await writeFile(wrong.qualification,JSON.stringify(stale));await assert.rejects(assembleRelease(wrong),/SCOPE_MISMATCH/);
 const changed=await fixture(t);await writeFile(join(changed.source,'tilde-0.1.0.tar.gz'),'corrupt');await assert.rejects(assembleRelease(changed),/DIGEST_MISMATCH/);
});
test('defaultAssemblyNeverAcceptsOpaqueFakePackage',async t=>{const f=await fixture(t);delete f.packageInspector;await assert.rejects(assembleRelease(f),/PACKAGE_ARCHIVE_INVALID/);});
import {gzipSync} from 'node:zlib';
test('archiveCannotHidePrivateTrailingPayload',async t=>{
 const f=await fixture(t),archive=join(f.source,'tilde-0.1.0.tar.gz');const bytes=Buffer.concat([await readFile(archive),gzipSync(Buffer.from('private trailing payload outside the public tar tree'))]);await writeFile(archive,bytes);
 const manifest=JSON.parse(await readFile(join(f.source,'source-manifest.json'),'utf8'));manifest.archiveSha256=sha(bytes);await writeFile(join(f.source,'source-manifest.json'),JSON.stringify(manifest));
 const report=JSON.parse(await readFile(f.qualification,'utf8'));report.subject.sourceSha256=sha(bytes);await writeFile(f.qualification,JSON.stringify(report));
 await assert.rejects(assembleRelease(f),/SOURCE_ARCHIVE_INVALID/);
});
test('duplicateSourceManifestRecordsCannotHideMembership',async t=>{
 const f=await fixture(t),path=join(f.source,'source-manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));manifest.files[manifest.files.length-1]=manifest.files[0];await writeFile(path,JSON.stringify(manifest));await assert.rejects(assembleRelease(f),/SOURCE_MANIFEST_INVALID/);
});

test('assemblyRejectsPackageBuiltFromAnotherSource',async t=>{
 const f=await fixture(t),inspector=f.packageInspector;f.packageInspector=async(...args)=>({...await inspector(...args),build:{recipeSha256:'a'.repeat(64),qtVersion:'6.12.0'}});
 await assert.rejects(assembleRelease(f),/PACKAGE_SOURCE_BUILD_MISMATCH/);
});

test('malformedPrivateQualificationCannotLeakIntoPublicSummary',async t=>{
 for(const mode of ['retained-private-diagnostic','unknown-private-gate']){
  const f=await fixture(t),report=JSON.parse(await readFile(f.qualification,'utf8'));
  const canary='SYNTHETIC_PRIVATE_REPORT_CANARY';
  if(mode==='retained-private-diagnostic')report.errors=['private diagnostic '+canary];
  else report.inputs.reports=[{version:1,runId:'synthetic',environment:'synthetic',cases:[{id:canary}]}];
  await writeFile(f.qualification,JSON.stringify(report));
  await assert.rejects(assembleRelease(f),/RELEASE_QUALIFICATION_INVALID/);
  await assert.rejects(readdir(f.output),{code:'ENOENT'});
 }
});
