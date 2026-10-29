import {open,mkdir,mkdtemp,readFile,writeFile,cp,readdir,lstat,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {evaluateQualification,validateSubject} from './release/gates.mjs';
import {noSymlinkParents} from './release/files.mjs';
import {inspectArchTree,parsePackageInfo} from './qualify-arch.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scripts=dirname(fileURLToPath(import.meta.url));
async function snapshot(input,destination){
 input=resolve(input);await noSymlinkParents('/',input);const fd=await open(input,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK),out=await open(destination,'wx',0o600);const digest=createHash('sha256');
 try{const before=await fd.stat();if(!before.isFile()||before.nlink!==1||before.size>2*1024**3)throw Error('RELEASE_INPUT_UNSAFE');for await(const bytes of fd.createReadStream({autoClose:false})){digest.update(bytes);await out.writeFile(bytes);}const after=await fd.stat();if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('RELEASE_INPUT_CHANGED');await out.sync();return digest.digest('hex');}finally{await out.close();await fd.close();}
}
function audit(kind,path){const result=spawnSync('python3',[join(scripts,'release/audit-archive.py'),kind,path],{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});if(result.error||result.status!==0)throw Error('RELEASE_'+kind.toUpperCase()+'_ARCHIVE_INVALID');return JSON.parse(result.stdout);}
export async function inspectReleasePackage(path,scratch){
 audit('package',path);const tree=join(scratch,'package-tree');await mkdir(tree,{mode:0o700});const extract=spawnSync('bsdtar',['-xf',path,'-C',tree],{encoding:'utf8',timeout:120000,maxBuffer:1048576});if(extract.error||extract.status!==0)throw Error('RELEASE_PACKAGE_EXTRACTION_FAILED');const info=parsePackageInfo(await readFile(join(tree,'.PKGINFO'),'utf8'));const result=await inspectArchTree(tree,info);if(!result.valid||info.name!=='tilde-assistant'||info.version!=='0.1.1-1')throw Error('RELEASE_PACKAGE_INSPECTION_FAILED');const notices={};for(const path of ['LICENSE','THIRD_PARTY_NOTICES.md','third-party/inventory.json'])notices[path]=sha(await readFile(join(tree,'usr/share/licenses/tilde',path)));const buildInfo=await readFile(join(tree,'.BUILDINFO'),'utf8');const recipes=[...buildInfo.matchAll(/^pkgbuild_sha256sum = ([a-f0-9]{64})$/gm)];const qt=info.dependencies.filter(d=>/^qt6-(base|declarative)>=6\.\d+\.\d+$/.test(d)).map(d=>d.split('>=')[1]);if(recipes.length!==1||qt.length!==2||qt[0]!==qt[1])throw Error('RELEASE_PACKAGE_BUILD_METADATA_INVALID');return{...result,info,notices,build:{recipeSha256:recipes[0][1],qtVersion:qt[0]}};
}
export async function assembleRelease({source,package:packagePath,qualification,output,packageInspector=inspectReleasePackage}){
 source=resolve(source);output=resolve(output);const sourceManifest=JSON.parse(await readFile(join(source,'source-manifest.json'),'utf8'));
 if(sourceManifest.version!=='0.1.1'||!Array.isArray(sourceManifest.files)||new Set(sourceManifest.files.map(f=>f?.path)).size!==sourceManifest.files.length||sourceManifest.files.some(f=>!f||typeof f.path!=='string'||!['file','symlink'].includes(f.type)))throw Error('RELEASE_SOURCE_MANIFEST_INVALID');
 const scratch=await mkdtemp(join(tmpdir(),'tilde-release-'));let manifest;
 try{
  const sourceCopy=join(scratch,'tilde-0.1.1.tar.gz'),packageCopy=join(scratch,'tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst');
  const sourceSha256=await snapshot(join(source,'tilde-0.1.1.tar.gz'),sourceCopy),packageSha256=await snapshot(packagePath,packageCopy);
  if(sourceSha256!==sourceManifest.archiveSha256)throw Error('RELEASE_SOURCE_DIGEST_MISMATCH');
  const inspectedSource=audit('source',sourceCopy),actual=new Map(inspectedSource.files.map(f=>[f.path,f]));
  if(actual.size!==sourceManifest.files.length)throw Error('RELEASE_SOURCE_FILE_COUNT_MISMATCH');
  for(const expected of sourceManifest.files){const file=actual.get(expected.path);if(!file||['type','mode','sha256','target'].some(key=>file[key]!==expected[key]))throw Error('RELEASE_SOURCE_FILE_IDENTITY_MISMATCH');}
  const inspectedPackage=await packageInspector(packageCopy,scratch);
  const originalBytes=await readFile(qualification),original=JSON.parse(originalBytes);validateSubject(original.subject);
  if(original.version!==1||original.kind!=='tilde-m4-qualification'||original.subject.sourceSha256!==sourceSha256||original.subject.packageSha256!==packageSha256||!original.inputs)throw Error('RELEASE_QUALIFICATION_SCOPE_MISMATCH');
  const evaluated=evaluateQualification({...original.inputs,subject:original.subject});
  // Diagnostics may contain private report values. Invalid reports remain private
  // and cannot enter even a verification_pending public asset directory.
  if(!Array.isArray(original.errors)||original.errors.length||evaluated.errors.length)throw Error('RELEASE_QUALIFICATION_INVALID');
  const ready=original.ready===true&&original.readiness==='ready'&&Array.isArray(original.errors)&&original.errors.length===0&&evaluated.ready;
  const notes=inspectedSource.bodies;const build=inspectedPackage.build;if(!build||!/^6\.\d+\.\d+$/.test(build.qtVersion??'')||sha(Buffer.from(notes['packaging/arch/PKGBUILD'].replaceAll('@SOURCE_SHA256@',sourceSha256).replaceAll('@QT_VERSION@',build.qtVersion)))!==build.recipeSha256)throw Error('RELEASE_PACKAGE_SOURCE_BUILD_MISMATCH');const inventory=JSON.parse(notes['packaging/licenses/inventory.json']);
  if(inventory.version!==1||!Array.isArray(inventory.components)||!Array.isArray(inventory.unresolved))throw Error('RELEASE_LICENSE_INVENTORY_INVALID');
  if(ready&&inventory.unresolved.length&&evaluated.outcomes.find(r=>r.id==='licenses.shipped')?.status!=='owner_exception')throw Error('RELEASE_LICENSE_STATE_CONFLICT');
  const expectedNotices={LICENSE:sha(Buffer.from(notes.LICENSE)),'THIRD_PARTY_NOTICES.md':sha(Buffer.from(notes['THIRD_PARTY_NOTICES.md'])),'third-party/inventory.json':sha(Buffer.from(notes['packaging/licenses/inventory.json']))};
  if(!inspectedPackage.valid||Object.keys(expectedNotices).some(key=>inspectedPackage.notices?.[key]!==expectedNotices[key]))throw Error('RELEASE_PACKAGE_NOTICE_SOURCE_MISMATCH');
  await noSymlinkParents('/',output);await mkdir(output,{mode:0o700});
  const assets=['tilde-0.1.1.tar.gz','tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst','LICENSE','THIRD_PARTY_NOTICES.md','license-inventory.json','release-notes-0.1.1.md','qualification-summary.json','build-manifest.json'];
  await cp(sourceCopy,join(output,assets[0]),{errorOnExist:true,force:false});await cp(packageCopy,join(output,assets[1]),{errorOnExist:true,force:false});
  for(const [name,body] of [['LICENSE',notes.LICENSE],['THIRD_PARTY_NOTICES.md',notes['THIRD_PARTY_NOTICES.md']],['release-notes-0.1.1.md',notes['docs/public/release-notes-0.1.1.md']],['license-inventory.json',JSON.stringify(inventory,null,2)+'\n']])await writeFile(join(output,name),body,{flag:'wx',mode:0o644});
  const summary={version:1,sourceSha256,packageSha256,readiness:ready?'ready':'verification_pending',required:evaluated.outcomes.map(r=>({id:r.id,required:true,status:r.status,environment:r.environment,...(r.status==='owner_exception'?{disposition:'owner accepted exact recorded scope'}:{})})),blockingIds:evaluated.blockingIds,validationErrors:[],publicationPrerequisites:evaluated.publicationPrerequisites};
  await writeFile(join(output,'qualification-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o644});
  manifest={version:1,productVersion:'0.1.1',architecture:'x86_64',readiness:summary.readiness,sourceSha256,packageSha256,qualificationSha256:sha(originalBytes),licenseInventorySha256:sha(Buffer.from(notes['packaging/licenses/inventory.json'])),packageInfo:inspectedPackage.info,packageBuild:inspectedPackage.build,assets:[...assets,'SHA256SUMS'],sourceFiles:sourceManifest.files.length,bundledNode:false,bundledQt:false,remotePublication:false,remoteCI:evaluated.publicationPrerequisites[0].status};
  await writeFile(join(output,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o644});
  await writeFile(join(output,'SHA256SUMS'),(await Promise.all(assets.map(async path=>sha(await readFile(join(output,path)))+'  '+path))).join('\n')+'\n',{flag:'wx',mode:0o644});
  const directory=await open(output,'r');try{await directory.sync();}finally{await directory.close();}return manifest;
 }finally{await rm(scratch,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const{values}=parseArgs({options:{source:{type:'string'},package:{type:'string'},qualification:{type:'string'},output:{type:'string'}}});if(!values.source||!values.package||!values.qualification||!values.output)throw Error('ASSEMBLY_ARGUMENTS_REQUIRED');console.log(JSON.stringify(await assembleRelease(values),null,2));}
