import {mkdir,writeFile,readFile,lstat} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {runCommand} from './release/commands.mjs';
import {childEnvironment} from './release/runtime.mjs';
import {writeQualificationReport} from './release/report.mjs';
import {noSymlinkParents} from './release/files.mjs';
export const powerCases=['negative-control','positive-control','fresh-state','committed-state','pending-approval','effect-before-journal','budget-pause','owned-job','catalog-ui'];
export async function qualifyPower({grant,case:scenario,evidence,root=resolve('.')}){
 evidence=resolve(evidence);await noSymlinkParents('/',evidence);await mkdir(evidence,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});const s=await lstat(evidence);if(!s.isDirectory()||s.uid!==process.geteuid()||(s.mode&0o777)!==0o700)throw Error('POWER_EVIDENCE_UNSAFE');
 let status='not_run',exitCode=null,cleanup=null,details={physicalPowerLoss:false,calibration:'not_run',applicationCases:'not_run',scope:'Required isolated guest volatile-cache model; ordinary files/process kills do not qualify this gate.'},files=['operator-boundary.json'];
 let reportName='report.json';
 if(grant){
  if(!powerCases.includes(scenario))throw Error('POWER_CASE_REQUIRED');reportName=`report-${scenario}.json`;
  const result=await runCommand({executable:'python3',args:[join(root,'tests/qualification/power/run_case.py'),'--grant',resolve(grant),'--case',scenario,'--evidence',evidence],cwd:root,env:childEnvironment(process.execPath),evidence,name:`driver-${scenario}`,timeout:600000});
  files=[`driver-${scenario}.log`,`driver-${scenario}.command.json`];exitCode=result.exitCode;status='fail';cleanup=false;
  if(result.exitCode===0&&!result.timedOut){
   const log=await readFile(join(evidence,`driver-${scenario}.log`),'utf8');const observed=JSON.parse(log.trim().split('\n').at(-1));
   const complete=powerCases.every(id=>observed.verifiedCases?.includes(id));cleanup=observed.result?.cleanup===true;
   status=complete&&cleanup?'pass':'not_run';details={...details,calibration:powerCases.slice(0,2).every(id=>observed.verifiedCases.includes(id))?'pass':'incomplete',applicationCases:observed.verifiedCases.filter(id=>!id.endsWith('control')),sourceSha256:observed.sourceSha256,scopeSha256:observed.scopeSha256,allRequiredCases:complete,actualGuestCut:true,lastCase:scenario};
  }
 }else{
  await writeFile(join(evidence,'operator-boundary.json'),JSON.stringify({ownerGrant:null,guestBooted:false,guestChanged:false,hostBlockDeviceOpened:false,cuts:0,physicalPowerLoss:false,requiredCases:powerCases,reason:'New isolated guest setup/device/cut/reopen scope is required; provisioning-only scope is consumed.'},null,2)+'\n',{flag:'wx',mode:0o600});
 }
 const row={id:'recovery.product-storage-loss',required:true,status,environment:'Disposable Arch guest; independently calibrated flush-aware in-memory write cache; not physical power loss',evidence:files,exitCode,cleanup,details};
 await writeQualificationReport({path:join(evidence,reportName),runId:basename(evidence),environment:row.environment,cases:[row]});return row;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const{values}=parseArgs({options:{grant:{type:'string'},case:{type:'string'},evidence:{type:'string'}}});if(!values.evidence)throw Error('POWER_EVIDENCE_REQUIRED');const row=await qualifyPower(values);console.log(JSON.stringify(row,null,2));if(row.status!=='pass')process.exitCode=1;}
