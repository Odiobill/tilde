import {readFile,readdir,lstat,open,mkdir,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {noSymlinkParents} from './release/files.mjs';
import {evaluateQualification,safeEvidencePath,validateSubject} from './release/gates.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
async function regular(path,{privateFile=false,maxBytes=4194304}={}){
 await noSymlinkParents('/',path);const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=await file.stat();if(!s.isFile()||s.nlink!==1||![0,process.geteuid()].includes(s.uid)||privateFile&&(s.uid!==process.geteuid()||(s.mode&0o777)!==0o600)||s.size>maxBytes)throw Error('QUALIFICATION_INPUT_UNSAFE');const raw=await file.readFile();const after=await file.stat();if(s.ino!==after.ino||s.size!==after.size||s.mtimeNs!==after.mtimeNs||s.mtimeMs!==after.mtimeMs)throw Error('QUALIFICATION_INPUT_CHANGED');return raw;}finally{await file.close();}
}
async function json(path,options){try{const raw=await regular(path,options);return{value:JSON.parse(raw.toString('utf8')),sha256:hash(raw)};}catch(error){throw Error(error.message?.startsWith('QUALIFICATION_')?error.message:'QUALIFICATION_JSON_INVALID');}}
async function directory(path){await noSymlinkParents('/',path);const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.geteuid()||(s.mode&0o777)!==0o700)throw Error('QUALIFICATION_DIRECTORY_UNSAFE');}
export async function qualifyRelease({manifest,reports,exceptions,scope,output}){
 const manifestPath=resolve(manifest),reportsPath=resolve(reports),scopePath=resolve(scope);output=resolve(output);await directory(reportsPath);const loadErrors=[],loaded=[];
 const required=(await json(manifestPath)).value,subject=(await json(scopePath,{privateFile:true})).value;validateSubject(subject);
 for(const entry of await readdir(reportsPath,{withFileTypes:true})){
  if(entry.isDirectory())continue;
  if(!entry.isFile()||!/^[\w.-]+\.json$/.test(entry.name)){loadErrors.push('UNEXPECTED_REPORT_ENTRY');continue;}
  try{
   const {value:report,sha256}=await json(join(reportsPath,entry.name),{privateFile:true});report.reportSha256=sha256;
   if(!Array.isArray(report.cases))throw Error('REPORT_CASES_MISSING');
   for(const row of report.cases){
    if(!Array.isArray(row.evidence)||!row.evidenceSha256)throw Error('EVIDENCE_IDENTITY_MISSING');
    for(const path of row.evidence){if(!safeEvidencePath(path))throw Error('EVIDENCE_PATH_UNSAFE');const bytes=await regular(join(reportsPath,path),{privateFile:true,maxBytes:67108864});if(hash(bytes)!==row.evidenceSha256[path])throw Error('EVIDENCE_DIGEST_MISMATCH');}
   }
   loaded.push(report);
  }catch(error){loadErrors.push(entry.name+':'+error.message);}
 }
 const accepted=[];
 if(exceptions){const path=resolve(exceptions);await directory(path);for(const entry of await readdir(path,{withFileTypes:true})){if(!entry.isFile()||!/^[\w.-]+\.json$/.test(entry.name)){loadErrors.push('UNEXPECTED_EXCEPTION_ENTRY');continue;}try{accepted.push((await json(join(path,entry.name),{privateFile:true})).value);}catch(error){loadErrors.push(entry.name+':'+error.message);}}}
 const result=evaluateQualification({manifest:required,reports:loaded,exceptions:accepted,subject});
 result.errors.push(...loadErrors);if(loadErrors.length){result.ready=false;result.readiness='verification_pending';result.publicationReady=false;}
 result.inputManifestSha256=hash(await regular(manifestPath));result.inputScopeSha256=hash(await regular(scopePath,{privateFile:true}));
 await noSymlinkParents('/',output);const parent=await lstat(dirname(output));if(!parent.isDirectory()||parent.uid!==process.geteuid()||(parent.mode&0o777)!==0o700)throw Error('QUALIFICATION_OUTPUT_PARENT_UNSAFE');
 const fd=await open(output,'wx',0o600);try{await fd.writeFile(JSON.stringify(result,null,2)+'\n');await fd.sync();}finally{await fd.close();}const folder=await open(dirname(output),'r');try{await folder.sync();}finally{await folder.close();}return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const{values}=parseArgs({options:{manifest:{type:'string'},reports:{type:'string'},exceptions:{type:'string'},scope:{type:'string'},output:{type:'string'}}});if(!values.manifest||!values.reports||!values.scope||!values.output)throw Error('QUALIFICATION_ARGUMENTS_REQUIRED');const result=await qualifyRelease(values);console.log(JSON.stringify({ready:result.ready,readiness:result.readiness,blockingIds:result.blockingIds,errors:result.errors,publicationPrerequisites:result.publicationPrerequisites},null,2));if(!result.ready)process.exitCode=1;}
