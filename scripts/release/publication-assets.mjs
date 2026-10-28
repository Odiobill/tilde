import {readFile,mkdtemp,writeFile,mkdir,cp,rm,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {assembleRelease} from '../assemble-release.mjs';
import {validateSourceRecord} from './source-identity.mjs';
import {sha256,noSymlinkParents} from './files.mjs';
export const publicCoreAssets=['tilde-assistant-0.1.0-1-x86_64.pkg.tar.zst','LICENSE','THIRD_PARTY_NOTICES.md','license-inventory.json','release-notes-0.1.0.md','qualification-summary.json','source-identity.json'];
export async function preparePublicationAssets({baselineAssets,qualificationPath,sourceRecord,releaseNotesPath,output,packageInspector}){
 validateSourceRecord(sourceRecord);
 const scratch=await mkdtemp(join(tmpdir(),'tilde-publication-'));
 try{
  const original=JSON.parse(await readFile(join(baselineAssets,'build-manifest.json')));
  const qualifiedBytes=await readFile(qualificationPath),q=JSON.parse(qualifiedBytes);
  if(original.qualificationSha256!==sha256(qualifiedBytes)||original.sourceSha256!==sourceRecord.canonicalArchiveSha256||q.subject?.packageSha256!==original.packageSha256)throw Error('PUBLICATION_QUALIFICATION_IDENTITY_MISMATCH');
  const source=join(scratch,'source');await mkdir(source);
  await writeFile(join(source,'source-manifest.json'),JSON.stringify({version:'0.1.0',archiveSha256:sourceRecord.canonicalArchiveSha256,files:sourceRecord.files}));
  const archive=join(baselineAssets,'tilde-0.1.0.tar.gz');await noSymlinkParents('/',archive);if(!(await lstat(archive)).isFile())throw Error('PUBLICATION_SOURCE_UNSAFE');await cp(archive,join(source,'tilde-0.1.0.tar.gz'),{force:false,errorOnExist:true});
  const assembled=join(scratch,'assembled'),r=await assembleRelease({source,package:join(baselineAssets,publicCoreAssets[0]),qualification:qualificationPath,output:assembled,packageInspector});
  if(r.readiness!=='ready'||r.packageSha256!==original.packageSha256)throw Error('PUBLICATION_LOCAL_QUALIFICATION_REQUIRED');
  const notes=await readFile(releaseNotesPath,'utf8');if(!notes.includes(`https://github.com/Odiobill/tilde/`)||/\.superpowers|\/home\/|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/.test(notes))throw Error('PUBLICATION_NOTES_INVALID');
  await noSymlinkParents('/',output);await mkdir(output,{mode:0o700});
  for(const name of publicCoreAssets){
   if(name==='source-identity.json')await writeFile(join(output,name),JSON.stringify(sourceRecord,null,2)+'\n',{flag:'wx'});
   else if(name==='release-notes-0.1.0.md')await writeFile(join(output,name),notes,{flag:'wx'});
   else await cp(join(assembled,name),join(output,name),{force:false,errorOnExist:true});
  }
  return{assets:[...publicCoreAssets],sourceRecord,localQualification:{ready:true,publicationReady:false,sourceSha256:r.sourceSha256,packageSha256:r.packageSha256}};
 }finally{await rm(scratch,{recursive:true,force:true});}
}
