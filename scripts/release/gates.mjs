import {validateCase} from './report.mjs';
export const gatePolicy=[
 ['runtime.floor22','node22-floor',false],['runtime.latest22','node22-latest',false],['runtime.latest24','node24-latest',false],['runtime.archSystem','arch-system-node',false],['source.clean','clean-public-source',false],['arch.installed','disposable-arch-x86_64',true],['provider.local','local-openai-compatible',true],['desktop.hyprland-wayland','hyprland-wayland',false],['desktop.plasma-wayland','plasma-wayland',false],['desktop.plasma-x11','plasma-x11',false],['accessibility.real','installed-atspi-operator',true],['performance.reference','reference-native-default-renderer',false],['recovery.process','owned-process-crash',false],['recovery.product-storage-loss','calibrated-guest-volatile-cache',true],['security.regression','synthetic-security-regressions',false],['licenses.shipped','shipped-component-inventory',true],['export.clean','allowlisted-public-source',false],['docs.local','local-static-docs',false],['workflows.local','local-workflow-validation',false],['review.final','single-fresh-final-review',true],['manual.owner','owner-final-installed-session',true]
];
export const requiredIds=gatePolicy.map(([id])=>id);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function safeEvidencePath(path){return typeof path==='string'&&/^[A-Za-z0-9_./-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(part=>!part||part==='.'||part==='..');}
export function validateSubject(subject){if(!object(subject)||!sha(subject.sourceSha256)||!sha(subject.packageSha256))throw Error('QUALIFICATION_SUBJECT_INVALID');return subject;}
export function validateRequiredManifest(manifest){
 if(!object(manifest)||manifest.version!==1||!Array.isArray(manifest.gates)||manifest.gates.length!==gatePolicy.length||JSON.stringify(manifest.publicationPrerequisites)!==JSON.stringify(['github.remote-ci']))throw Error('REQUIRED_MANIFEST_INVALID');
 for(const [id,environment,packageBound] of gatePolicy){const rows=manifest.gates.filter(row=>row?.id===id);if(rows.length!==1||rows[0].required!==true||rows[0].environment!==environment||rows[0].packageBound!==packageBound)throw Error('REQUIRED_MANIFEST_INCOMPLETE_OR_DOWNGRADED');}
 return manifest;
}
function scopeMatches(row,policy,subject){return object(row?.scope)&&row.scope.sourceSha256===subject.sourceSha256&&row.scope.environment===policy[1]&&(!policy[2]||row.scope.packageSha256===subject.packageSha256);}
function evidenceShape(row){return Array.isArray(row.evidence)&&row.evidence.length>0&&new Set(row.evidence).size===row.evidence.length&&object(row.evidenceSha256)&&Object.keys(row.evidenceSha256).length===row.evidence.length&&row.evidence.every(p=>safeEvidencePath(p)&&sha(row.evidenceSha256[p]));}
function acceptedException(value,row,policy,subject){
 return object(value)&&value.version===1&&value.id===policy[0]&&value.environment===policy[1]&&value.sourceSha256===subject.sourceSha256&&(!policy[2]||value.packageSha256===subject.packageSha256)&&value.observedStatus===row.status&&value.ownerConfirmed===true&&typeof value.ownerStatement==='string'&&value.ownerStatement.trim().length>0&&typeof value.scope==='string'&&value.scope.trim().length>0&&Number.isFinite(Date.parse(value.ownerConfirmedAt))&&Date.parse(value.ownerConfirmedAt)<=Date.now()+60000&&row.cleanup!==false;
}
export function evaluateQualification({manifest,reports,exceptions=[],subject}={}){
 const errors=[],observations=new Map(),outcomes=[];let validSubject=true;
 try{validateRequiredManifest(manifest);validateSubject(subject);}catch(error){errors.push(error.message);validSubject=false;}
 if(!Array.isArray(reports))errors.push('REPORT_COLLECTION_INVALID');
 for(const report of Array.isArray(reports)?reports:[]){
  if(!object(report)||report.version!==1||!/^[\w.-]+$/.test(report.runId??'')||typeof report.environment!=='string'||!report.environment||!Array.isArray(report.cases)||report.cases.length>64){errors.push('REPORT_INVALID');continue;}
  for(const row of report.cases){
   if(!object(row)){errors.push('CASE_INVALID');continue;}
   if(!requiredIds.includes(row.id)&&row.id!=='github.remote-ci'){errors.push('UNKNOWN_GATE:'+row.id);continue;}
   if(observations.has(row.id)){errors.push('DUPLICATE_GATE:'+row.id);observations.set(row.id,null);continue;}
   let invalid=false;try{validateCase(row);}catch(error){errors.push(row.id+':'+error.message);invalid=true;}
   if(!evidenceShape(row)){errors.push(row.id+':EVIDENCE_IDENTITY_MISSING');invalid=true;}
   observations.set(row.id,{row,runId:report.runId,reportSha256:report.reportSha256??null,invalid});
  }
 }
 if(!Array.isArray(exceptions)){errors.push('EXCEPTION_COLLECTION_INVALID');exceptions=[];}
 const seenExceptions=new Set();for(const exception of exceptions){if(!object(exception)||!requiredIds.includes(exception.id)||seenExceptions.has(exception.id)){errors.push('EXCEPTION_INVALID_OR_DUPLICATE');continue;}seenExceptions.add(exception.id);}
 for(const policy of gatePolicy){
  const id=policy[0],observation=observations.get(id),row=observation?.row;
  let status='not_run',reason='missing-required-row',exception=null;
  if(row){
   status=row.status;reason='raw-status:'+row.status;
   if(observation.invalid){status='fail';reason='invalid-observation';}
   else if(!validSubject||!scopeMatches(row,policy,subject)){status='fail';reason='stale-or-cross-environment-scope';}
   else if(row.cleanup===false){status='fail';reason='cleanup-failed';}
   else if(row.status==='pass'&&row.exitCode===0&&row.cleanup===true){status='pass';reason='qualified-observation';}
   else{
    const offered=exceptions.filter(value=>value?.id===id);
    if(offered.length===1&&acceptedException(offered[0],row,policy,subject)){status='owner_exception';reason='exact-scoped-owner-disposition';exception=offered[0];}
   }
  }
  outcomes.push({id,required:true,environment:policy[1],packageBound:policy[2],status,reason,observedStatus:row?.status??'not_run',observedRequired:row?.required??null,exitCode:row?.exitCode??null,cleanup:row?.cleanup??null,scope:row?.scope??null,evidence:row?.evidence??[],evidenceSha256:row?.evidenceSha256??{},runId:observation?.runId??null,reportSha256:observation?.reportSha256??null,...(exception?{exception}:{})});
 }
 const blockingIds=outcomes.filter(row=>!['pass','owner_exception'].includes(row.status)).map(row=>row.id);
 const ready=errors.length===0&&blockingIds.length===0;
 const remote=observations.get('github.remote-ci'),remotePassed=remote&&!remote.invalid&&remote.row.status==='pass'&&remote.row.cleanup===true&&remote.row.exitCode===0&&remote.row.scope?.sourceSha256===subject?.sourceSha256&&remote.row.details?.remoteExecution===true&&/^https:\/\/github\.com\/[-\w.]+\/[-\w.]+\/actions\/runs\/\d+$/.test(remote.row.details?.url??'');
 const publicationPrerequisites=[{id:'github.remote-ci',requiredForPublication:true,status:remotePassed?'pass':'not_run',locallyExecuted:false}];
 return{version:1,kind:'tilde-m4-qualification',subject:validSubject?subject:null,ready,readiness:ready?'ready':'verification_pending',publicationReady:ready&&remotePassed===true,publicationPrerequisites,blockingIds,errors,outcomes,inputs:{manifest,reports,exceptions}};
}
