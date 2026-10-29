import {execFile} from 'node:child_process';import {promisify} from 'node:util';
export const executeGithub=promisify(execFile);
const hex=(v,n)=>typeof v==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(v);
export async function githubRead(endpoint,{execute=executeGithub,bytes=false,limit=4*1024*1024}={}){
 if(!endpoint.startsWith('repos/Odiobill/tilde/')||endpoint.includes('\n'))throw Error('GITHUB_ENDPOINT_INVALID');
 try{const args=['api',endpoint];if(bytes)args.push('-H','Accept: application/octet-stream');const {stdout}=await execute('gh',args,{encoding:bytes?'buffer':'utf8',timeout:120000,maxBuffer:limit});return bytes?Buffer.from(stdout):JSON.parse(stdout.toString());}
 catch(error){const failure=Error('GITHUB_READ_FAILED');try{failure.status=Number(JSON.parse(error.stdout?.toString()).status);}catch{}throw failure;}
}
export async function readTagCommit({execute=executeGithub}={}){
 let object=(await githubRead('repos/Odiobill/tilde/git/ref/tags/v0.1.1',{execute})).object;
 for(let n=0;object?.type==='tag'&&n<3;n++){if(!hex(object.sha,40))throw Error('PUBLICATION_BINDING_TAG_INVALID');object=(await githubRead('repos/Odiobill/tilde/git/tags/'+object.sha,{execute})).object;}
 if(object?.type!=='commit'||!hex(object.sha,40))throw Error('PUBLICATION_BINDING_TAG_INVALID');return object.sha;
}
export async function readRelease({execute=executeGithub,allowDraft=false}={}){
 let release;
 try{release=await githubRead('repos/Odiobill/tilde/releases/tags/v0.1.1',{execute});}
 catch(error){
  if(error.status!==404)throw error;
  if(!allowDraft)return null;
  // The tag endpoint only discovers published releases. Authenticated release
  // lists include drafts; bound the scan and reject ambiguous pending tags.
  const matches=[];
  for(let page=1;page<=10;page++){
   const rows=await githubRead(`repos/Odiobill/tilde/releases?per_page=100&page=${page}`,{execute});
   if(!Array.isArray(rows)||rows.length>100)throw Error('RELEASE_DISCOVERY_INVALID');
   matches.push(...rows.filter(r=>r?.tag_name==='v0.1.1'));
   if(rows.length<100)break;
   if(page===10)throw Error('RELEASE_DISCOVERY_LIMIT');
  }
  if(matches.length>1)throw Error('RELEASE_DISCOVERY_AMBIGUOUS');
  if(!matches.length)return null;
  release=matches[0];
 }
 if(!Number.isSafeInteger(release?.id)||release.id<=0||release.tag_name!=='v0.1.1')throw Error('RELEASE_DISCOVERY_INVALID');
 const full=await githubRead('repos/Odiobill/tilde/releases/'+release.id,{execute});
 if(full?.id!==release.id||full.tag_name!=='v0.1.1')throw Error('RELEASE_DISCOVERY_CHANGED');
 return full;
}
export function validateRemoteEvidence(e,{repository,baselineCommit,siteCommit,sourceSha256}){
 const bad=()=>{throw Error('REMOTE_EVIDENCE_INVALID');};
 if(repository!=='Odiobill/tilde'||!hex(baselineCommit,40)||!hex(siteCommit,40)||!hex(sourceSha256,64)||!e||e.version!==1||e.repository!==repository||e.baselineCommit!==baselineCommit||e.siteCommit!==siteCommit||e.tagCommit!==baselineCommit||e.baselineSourceSha256!==sourceSha256||e.archSourceSha256!==sourceSha256||e.runnerRemoved!==true||!Array.isArray(e.runs)||e.runs.length!==4)bad();
 const roles={'baseline-native':['ci.yml',baselineCommit],'baseline-arch':['arch.yml',baselineCommit],'site-native':['ci.yml',siteCommit],site:['site.yml',siteCommit]},seen=new Set(),ids=new Set();
 for(const r of e.runs){
  const policy=roles[r?.role];if(!policy||seen.has(r.role)||!Number.isSafeInteger(r.id)||r.id<=0||ids.has(r.id)||r.workflow!==policy[0]||r.headSha!==policy[1]||r.status!=='completed'||r.conclusion!=='success'||!['push','workflow_dispatch'].includes(r.event)||r.role==='baseline-arch'&&r.event!=='workflow_dispatch'||r.url!==`https://github.com/Odiobill/tilde/actions/runs/${r.id}`||!Array.isArray(r.jobs))bad();
  seen.add(r.role);ids.add(r.id);const required=r.workflow==='ci.yml'?['native (22.19.0)','native (22.x)','native (24.x)']:[r.workflow==='arch.yml'?'arch':'site'];
  if(r.jobs.length!==required.length||new Set(r.jobs.map(j=>j.name)).size!==required.length||r.jobs.some(j=>!required.includes(j.name)||j.status!=='completed'||j.conclusion!=='success'))bad();
 }
 return e;
}
export async function readRemoteEvidence(seed,{execute=executeGithub,checkRunners=true}={}){
 const runs=[];
 for(const offered of seed.runs??[]){if(!Number.isSafeInteger(offered.id)||offered.id<=0)throw Error('REMOTE_EVIDENCE_RUN_INVALID');const path='repos/Odiobill/tilde/actions/runs/'+offered.id;
  const r=await githubRead(path,{execute}),j=await githubRead(path+'/jobs?filter=latest&per_page=100',{execute});
  if(r.repository?.full_name!=='Odiobill/tilde'||r.id!==offered.id||j.total_count!==j.jobs?.length)throw Error('REMOTE_EVIDENCE_RUN_INVALID');
  runs.push({role:offered.role,id:r.id,workflow:r.path?.split('@')[0].replace(/^\.github\/workflows\//,''),headSha:r.head_sha,event:r.event,status:r.status,conclusion:r.conclusion,url:r.html_url,jobs:j.jobs.map(x=>({name:x.name,status:x.status,conclusion:x.conclusion}))});
 }
 let runnerRemoved=seed.runnerRemoved;if(checkRunners){const r=await githubRead('repos/Odiobill/tilde/actions/runners?per_page=100',{execute});runnerRemoved=r.total_count===0&&r.runners?.length===0;}
 const result={version:1,repository:'Odiobill/tilde',baselineCommit:seed.baselineCommit,siteCommit:seed.siteCommit,tagCommit:await readTagCommit({execute}),baselineSourceSha256:seed.baselineSourceSha256,archSourceSha256:seed.archSourceSha256,runnerRemoved,runs,checkedAt:new Date().toISOString()};
 return validateRemoteEvidence(result,{repository:result.repository,baselineCommit:seed.baselineCommit,siteCommit:seed.siteCommit,sourceSha256:seed.baselineSourceSha256});
}
