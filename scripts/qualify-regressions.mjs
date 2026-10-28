import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { runCommand } from './release/commands.mjs';
import { childEnvironment } from './release/runtime.mjs';
import { writeQualificationReport } from './release/report.mjs';
export async function qualifyRegressions({evidence,root=resolve('.')}){
 evidence=resolve(evidence);await mkdir(evidence,{mode:0o700});
 const env=childEnvironment(process.execPath), rows=[];
 const groups=[
  ['m4','security.regression',['tests/integration/dist/m4-regression.test.js','tests/integration/dist/tools.test.js','tests/integration/dist/tools-final-review.test.js','tests/integration/dist/settings-providers.test.js','packages/transport/dist/transport.test.js','packages/tools/dist/filesystem.test.js','packages/tools/dist/journal.test.js','packages/tools/dist/privacy.test.js']],
  ['recovery','recovery.process',['tests/integration/dist/integration.test.js']],
 ];
 for(const [name,id,files] of groups){
  const result=await runCommand({executable:process.execPath,args:['--test',...files],cwd:root,env,evidence,name,timeout:180000});
  rows.push({id,required:true,status:result.exitCode===0&&!result.timedOut?'pass':'fail',environment:`system Node ${process.versions.node}; synthetic private state; owned process/unit fixtures`,evidence:[`${name}.log`,`${name}.command.json`,'scope.json'],exitCode:result.exitCode,cleanup:result.exitCode===0&&!result.timedOut,details:{reusedExistingFixtures:true,physicalStorageLoss:false,nonIdempotentUnknownIsNotReplayed:true,cancellationIsNotRollback:true,ordinaryAccountShellUnrestricted:true}});
 }
 await writeFile(join(evidence,'scope.json'),JSON.stringify({groups,provider:'synthetic only',hostCuts:false,realInference:false,hostAuthentication:false,existingSessionsStopped:false},null,2)+'\n');
 await writeQualificationReport({path:join(evidence,'report.json'),runId:basename(evidence),environment:'bounded synthetic security/process regression',cases:rows});return rows;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const{values}=parseArgs({options:{evidence:{type:'string'}}});if(!values.evidence)throw Error('REGRESSION_EVIDENCE_REQUIRED');const cases=await qualifyRegressions({evidence:values.evidence});console.log(JSON.stringify(cases,null,2));if(cases.some(c=>c.status!=='pass'))process.exitCode=1;}
