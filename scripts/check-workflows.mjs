// JSON is a YAML subset. Keeping these workflow files in canonical JSON allows
// dependency-free structural validation instead of guessing YAML with regexes.
import {readFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const requiredCommands=['npm run build','npm run typecheck','npm test','npm run test:release','ctest --test-dir .build/cmake --output-on-failure'];
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validateReleaseInput({version,expectedSourceSha256,manifest}){
 if(version!=='0.1.1'||!/^([a-f0-9]{64})$/.test(expectedSourceSha256??'')||!object(manifest)||manifest.version!==version||manifest.archiveSha256!==expectedSourceSha256||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('RELEASE_IDENTITY_MISMATCH');
 const names=new Set();for(const file of manifest.files){if(!object(file)||typeof file.path!=='string'||file.path.startsWith('/')||file.path.includes('\\')||file.path.split('/').some(s=>!s||s==='.'||s==='..'||['.git','.superpowers','.aws','.codex','.agents','experiments','node_modules','dist','.build'].includes(s))||names.has(file.path)||!/^([a-f0-9]{64})$/.test(file.sha256??''))throw Error('RELEASE_SOURCE_MANIFEST_INVALID');names.add(file.path);}
 return true;
}
export function validateWorkflow(workflow,{name,pins}){
 const problems=[],bad=reason=>problems.push(reason),allowedPins=new Set(pins.actions.map(a=>a.repository+'@'+a.commit));
 if(!object(workflow)||!object(workflow.on)||!object(workflow.jobs)||!Object.keys(workflow.jobs).length)return{valid:false,problems:['workflow-structure']};
 const events=Object.keys(workflow.on),manualOnly=['pages.yml','release-draft.yml'].includes(name);
 if(events.some(e=>!['push','pull_request','workflow_dispatch','workflow_call'].includes(e))||manualOnly&&(events.length!==1||events[0]!=='workflow_dispatch')||name==='arch.yml'&&events.some(e=>!['workflow_dispatch','workflow_call'].includes(e)))bad('workflow-event-authority');
 if(JSON.stringify(workflow.permissions)!==JSON.stringify({contents:'read'}))bad('root-permissions');
 for(const [id,job] of Object.entries(workflow.jobs)){
  if(!object(job)){bad('job-structure');continue;}
  if(job['continue-on-error']||job.secrets)bad('job-authority-or-failure-bypass');
  const permission=job.permissions??workflow.permissions;
  const allowedWrite=name==='release-draft.yml'&&id==='draft'?{contents:'write'}:name==='pages.yml'&&id==='deploy'?{pages:'write','id-token':'write'}:null;
  if(allowedWrite){if(JSON.stringify(permission)!==JSON.stringify(allowedWrite)||!String(job.if).includes("github.event_name == 'workflow_dispatch'")||!String(job.if).includes('github.event.repository.default_branch'))bad('manual-write-job-boundary');}
  else if(!object(permission)||Object.entries(permission).some(([key,value])=>key!=='contents'||value!=='read'))bad('read-only-job-permissions');
  if(job.uses){if(!/^\.\/\.github\/workflows\/(?:ci|arch)\.yml$/.test(job.uses))bad('unverified-reusable-workflow');continue;}
  if(!Number.isInteger(job['timeout-minutes'])||job['timeout-minutes']<1||job['timeout-minutes']>60)bad('job-timeout');
  if(!Array.isArray(job.steps)||!job.steps.length)bad('job-steps');
  for(const step of job.steps??[]){
   if(step['continue-on-error'])bad('step-failure-bypass');
   if(step.uses){
    if(!allowedPins.has(step.uses))bad('action-pin-unverified');
    if(step.uses.startsWith('actions/checkout@')&&step.with?.['persist-credentials']!==false)bad('checkout-keeps-credentials');
    if(step.uses.startsWith('actions/deploy-pages@')&&!(name==='pages.yml'&&id==='deploy'))bad('pages-deploy-authority');
   }
   if(step.run&&(/\$\{\{/.test(step.run)||/gh\s+release\s+(?:create|edit|upload)|curl.*(?:api\.github|deploy)/.test(step.run)))bad('inline-untrusted-or-publish-command');
  }
 }
 if(name==='ci.yml'){
  const native=workflow.jobs.native,run=native?.steps?.filter(s=>s.run&&s.if===undefined).map(s=>s.run).join('\n')??'';
  if(!requiredCommands.every(command=>run.split('\n').some(line=>line.trim()===command)))bad('ci-native-gate-missing');
  if(workflow.name!=='fixture'&&(!Array.isArray(native?.strategy?.matrix?.node)||JSON.stringify(native.strategy.matrix.node)!==JSON.stringify(['22.19.0','22.x','24.x'])))bad('ci-runtime-matrix-missing');
  if(native?.if!==undefined)bad('ci-native-gate-conditional');
 }
 if(name==='release-draft.yml'){
  const draft=workflow.jobs.draft;
  if(!Array.isArray(draft?.needs)||!['identity','native','arch'].every(key=>draft.needs.includes(key))||workflow.jobs.native?.uses!=='./.github/workflows/ci.yml'||workflow.jobs.arch?.uses!=='./.github/workflows/arch.yml')bad('release-native-dependency-missing');
  if(!draft?.steps?.some(s=>s.run?.startsWith('node scripts/ci-release.mjs assemble'))||!draft.steps.some(s=>s.run?.startsWith('node scripts/ci-release.mjs draft')))bad('release-identity-or-draft-command-missing');
  const inputs=workflow.on.workflow_dispatch?.inputs;if(inputs?.version?.required!==true||inputs?.source_sha256?.required!==true)bad('release-input-identity-missing');
 }
 if(name==='arch.yml'&&(!Array.isArray(workflow.jobs.arch?.['runs-on'])||!workflow.jobs.arch['runs-on'].includes('tilde-disposable-arch')||!String(workflow.jobs.arch.if).includes("github.event_name == 'workflow_dispatch'")))bad('arch-disposable-manual-boundary');
 if(name==='pages.yml'&&(!workflow.jobs.deploy?.needs?.includes('build')||!workflow.jobs.deploy.environment||workflow.jobs.deploy.environment.name!=='github-pages'))bad('pages-environment-boundary');
 return{valid:problems.length===0,problems};
}
export async function checkWorkflows({root=resolve('.')}={}){
 const pins=JSON.parse(await readFile(join(root,'packaging/release/actions.json'),'utf8')),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8')),problems=[];
 for(const pin of pins.actions)if(!/^actions\/[a-z-]+$/.test(pin.repository)||!/^([a-f0-9]{40})$/.test(pin.commit)||pin.reference!==`https://api.github.com/repos/${pin.repository}/git/ref/tags/${pin.tag}`||pin.commitUrl!==`https://api.github.com/repos/${pin.repository}/git/commits/${pin.commit}`||!pin.verifiedAt)problems.push('action-provenance-invalid');
 for(const name of ['ci.yml','arch.yml','release-draft.yml','pages.yml']){
  let workflow;try{workflow=JSON.parse(await readFile(join(root,'.github/workflows',name),'utf8'));}catch{problems.push(name+':invalid-canonical-json-yaml');continue;}
  const validated=validateWorkflow(workflow,{name,pins});problems.push(...validated.problems.map(p=>name+':'+p));
  for(const job of Object.values(workflow.jobs??{}))for(const step of job.steps??[])for(const line of (step.run??'').split('\n')){
   const script=line.match(/^(?:node|python3) ([a-zA-Z0-9_./-]+\.(?:mjs|py))(?= |$)/)?.[1];if(script){try{if(!(await lstat(join(root,script))).isFile())throw Error();}catch{problems.push(name+':missing-command-script:'+script);}}
   const npm=line.match(/^npm run ([\w:-]+)$/)?.[1];if(npm&&!pkg.scripts[npm])problems.push(name+':missing-npm-command:'+npm);
  }
 }
 return{valid:problems.length===0,problems,remoteExecution:'not_run',remotePublication:'not_run'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const result=await checkWorkflows();console.log(JSON.stringify(result,null,2));if(!result.valid)process.exitCode=1;}
