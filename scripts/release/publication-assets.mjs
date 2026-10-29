import {readFile,mkdtemp,writeFile,mkdir,cp,rm,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {assembleRelease} from '../assemble-release.mjs';
import {validateSourceRecord} from './source-identity.mjs';
import {sha256,noSymlinkParents} from './files.mjs';
import {validateRemoteEvidence} from './github-evidence.mjs';
import {evaluateQualification} from './gates.mjs';
export const publicCoreAssets=['tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst','LICENSE','THIRD_PARTY_NOTICES.md','license-inventory.json','release-notes-0.1.1.md','qualification-summary.json','source-identity.json'];
export const publicationTitle='Tilde 0.1.1 — early preview';
export function publicationBody(notes,ci){
 const labels={'baseline-native':'Baseline native CI','baseline-arch':'Baseline Arch CI','site-native':'Site commit native CI',site:'Static site CI'},roles=Object.keys(labels);
 if(typeof notes!=='string'||!notes.trim()||!Array.isArray(ci?.runs)||ci.runs.length!==roles.length||new Set(ci.runs.map(r=>r.role)).size!==roles.length||ci.runs.some(r=>!roles.includes(r.role)||!Number.isSafeInteger(r.id)||r.id<=0||r.url!==`https://github.com/Odiobill/tilde/actions/runs/${r.id}`))throw Error('PUBLICATION_BODY_INVALID');
 return notes.trim()+'\n\n## Verified CI\n\n'+roles.map(role=>`- [${labels[role]}](${ci.runs.find(r=>r.role===role).url})`).join('\n')+'\n';
}
export async function preparePublicationAssets({baselineAssets,qualificationPath,sourceRecord,releaseNotesPath,output,packageInspector}){
 validateSourceRecord(sourceRecord);
 const scratch=await mkdtemp(join(tmpdir(),'tilde-publication-'));
 try{
  const original=JSON.parse(await readFile(join(baselineAssets,'build-manifest.json')));
  const qualifiedBytes=await readFile(qualificationPath),q=JSON.parse(qualifiedBytes);
  if(original.qualificationSha256!==sha256(qualifiedBytes)||original.sourceSha256!==sourceRecord.canonicalArchiveSha256||q.subject?.packageSha256!==original.packageSha256)throw Error('PUBLICATION_QUALIFICATION_IDENTITY_MISMATCH');
  const source=join(scratch,'source');await mkdir(source);
  await writeFile(join(source,'source-manifest.json'),JSON.stringify({version:'0.1.1',archiveSha256:sourceRecord.canonicalArchiveSha256,files:sourceRecord.files}));
  const archive=join(baselineAssets,'tilde-0.1.1.tar.gz');await noSymlinkParents('/',archive);if(!(await lstat(archive)).isFile())throw Error('PUBLICATION_SOURCE_UNSAFE');await cp(archive,join(source,'tilde-0.1.1.tar.gz'),{force:false,errorOnExist:true});
  const assembled=join(scratch,'assembled'),r=await assembleRelease({source,package:join(baselineAssets,publicCoreAssets[0]),qualification:qualificationPath,output:assembled,packageInspector});
  if(r.readiness!=='ready'||r.packageSha256!==original.packageSha256)throw Error('PUBLICATION_LOCAL_QUALIFICATION_REQUIRED');
  const notes=await readFile(releaseNotesPath,'utf8');if(!notes.includes(`https://github.com/Odiobill/tilde/`)||/\.superpowers|\/home\/|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/.test(notes))throw Error('PUBLICATION_NOTES_INVALID');
  await noSymlinkParents('/',output);await mkdir(output,{mode:0o700});
  for(const name of publicCoreAssets){
   if(name==='source-identity.json')await writeFile(join(output,name),JSON.stringify(sourceRecord,null,2)+'\n',{flag:'wx'});
   else if(name==='release-notes-0.1.1.md')await writeFile(join(output,name),notes,{flag:'wx'});
   else await cp(join(assembled,name),join(output,name),{force:false,errorOnExist:true});
  }
  return{assets:[...publicCoreAssets],sourceRecord,localQualification:{ready:true,publicationReady:false,sourceSha256:r.sourceSha256,packageSha256:r.packageSha256}};
 }finally{await rm(scratch,{recursive:true,force:true});}
}
export async function finalizePublicationAssets({coreAssets,sourceRecord,remoteEvidence,siteCommit,output,baselineAssets,qualificationPath,expectedCoreAssets,packageInspector}){
 validateSourceRecord(sourceRecord);validateRemoteEvidence(remoteEvidence,{repository:sourceRecord.repository,baselineCommit:sourceRecord.baselineCommit,siteCommit,sourceSha256:sourceRecord.canonicalArchiveSha256});
 const scratch=await mkdtemp(join(tmpdir(),'tilde-final-publication-'));
 try{
  // Reevaluate the original raw qualification/package rather than trusting a
  // hand-written ready flag or a directory of previously named files.
  const rechecked=join(scratch,'rechecked');await preparePublicationAssets({baselineAssets,qualificationPath,sourceRecord,releaseNotesPath:join(coreAssets,'release-notes-0.1.1.md'),output:rechecked,packageInspector});
  const actual=await readdir(coreAssets);if(actual.length!==publicCoreAssets.length||actual.some(n=>!publicCoreAssets.includes(n))||!Array.isArray(expectedCoreAssets)||expectedCoreAssets.length!==publicCoreAssets.length||new Set(expectedCoreAssets.map(a=>a.name)).size!==publicCoreAssets.length)throw Error('PUBLICATION_CORE_ASSETS_INVALID');
  const assets=[];
  for(const name of publicCoreAssets){const path=join(coreAssets,name);await noSymlinkParents('/',path);if(!(await lstat(path)).isFile())throw Error('PUBLICATION_CORE_ASSET_UNSAFE');const bytes=await readFile(path),sha=sha256(bytes);if(sha!==sha256(await readFile(join(rechecked,name)))||expectedCoreAssets.find(a=>a.name===name)?.sha256!==sha)throw Error('PUBLICATION_CORE_ASSET_CHANGED');assets.push({name,sha256:sha,size:bytes.length});}
  const raw=JSON.parse(await readFile(qualificationPath)),q=evaluateQualification({...raw.inputs,subject:raw.subject});if(!q.ready||q.errors.length)throw Error('PUBLICATION_LOCAL_QUALIFICATION_REQUIRED');
  const manifest={version:1,kind:'tilde-publication',repository:sourceRecord.repository,productVersion:'0.1.1',tag:'v0.1.1',baselineCommit:sourceRecord.baselineCommit,siteCommit,canonicalSourceArchiveSha256:sourceRecord.canonicalArchiveSha256,packageSha256:q.subject.packageSha256,sourceRecordSha256:assets.find(a=>a.name==='source-identity.json').sha256,localQualification:{sourceSha256:q.subject.sourceSha256,packageSha256:q.subject.packageSha256,gates:q.outcomes.map(r=>({id:r.id,status:r.status,observedStatus:r.observedStatus,environment:r.environment}))},ci:remoteEvidence,assets};
  await noSymlinkParents('/',output);await mkdir(output,{mode:0o700});for(const name of publicCoreAssets)await cp(join(rechecked,name),join(output,name),{force:false,errorOnExist:true});
  const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),publicationManifestSha256=sha256(bytes);await writeFile(join(output,'publication-manifest.json'),bytes,{flag:'wx'});assets.push({name:'publication-manifest.json',sha256:publicationManifestSha256,size:bytes.length});
  const sums=Buffer.from(assets.map(a=>a.sha256+'  '+a.name).join('\n')+'\n');await writeFile(join(output,'SHA256SUMS'),sums,{flag:'wx'});
  const expected={version:1,repository:sourceRecord.repository,tag:'v0.1.1',baselineCommit:sourceRecord.baselineCommit,siteCommit,sourceSha256:sourceRecord.canonicalArchiveSha256,packageSha256:q.subject.packageSha256,publicationManifestSha256,assets:[...assets,{name:'SHA256SUMS',sha256:sha256(sums),size:sums.length}]};
  return{assets:expected.assets.map(a=>a.name),manifest:JSON.parse(bytes),expected};
 }finally{await rm(scratch,{recursive:true,force:true});}
}
