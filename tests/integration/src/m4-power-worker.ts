// Qualification-only worker. CLI requires a private guest scope plus the fixed
// guest helper's independent DMI/mount preflight. It never touches a host device.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, lstat, open, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { openNodeSqliteDatabase } from '@earendil-works/pi-durable/storage/sqlite/node';
import type { Journal } from '@tilde/tools';
import { resolvePaths,preparePaths,loadConfig,saveConfig,loadSelection,loadWorkLimits,updateWorkLimits } from '@tilde/config';
import { openAgent,createToolRuntime,admitExecutionPolicy,type ToolRuntime,type AgentSession } from '@tilde/agent';
import { openCredentialStore,saveApiKey } from '@tilde/credentials';
import { openJournal } from '@tilde/tools';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider,fauxAssistantMessage,fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { untilTool } from './tool-fixtures.js';
import type { ToolRequest } from '@tilde/protocol';
const exec=promisify(execFile),helper='/usr/local/libexec/tilde-m4-power-control';
export const powerScenarios=['fresh-state','committed-state','pending-approval','effect-before-journal','budget-pause','owned-job','catalog-ui'] as const;
export type PowerScenario=typeof powerScenarios[number];
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const powerShellScript="/usr/bin/node -e 'const f=require(\"node:fs\");const n=f.openSync(\"effect.log\",\"a\",384);f.writeSync(n,\"effect\\n\");f.fsyncSync(n);f.closeSync(n);const d=f.openSync(\".\",\"r\");f.fsyncSync(d);f.closeSync(d);f.writeFileSync(\"effect.ready\",\"fsynced\\n\",{mode:384});setInterval(()=>{},1000)'";
export type PowerExpected={scenario:PowerScenario;rootId:string;createdId?:string;selectionRevision:string;rows:unknown[];operation?:Record<string,unknown>;pause?:unknown;gui?:unknown;effectCount:number;job?:unknown;pragmas?:unknown[]};
function cleanEnv(home:string,manager=false):NodeJS.ProcessEnv{return{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:home,TMPDIR:home,XDG_CONFIG_HOME:join(home,'config'),XDG_STATE_HOME:join(home,'state'),XDG_DATA_HOME:join(home,'data'),XDG_CACHE_HOME:join(home,'cache'),XDG_RUNTIME_DIR:manager?'/run/user/'+process.geteuid!():join(home,'run'),...(manager?{DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/'+process.geteuid!()+'/bus'}:{})};}
async function guiState(home:string,mode:string,cid:string,revision:string){
 const binary=resolve(dirname(fileURLToPath(import.meta.url)),'../../../.build/cmake/apps/gui/tst_chat');
 const result=await exec(binary,['m4StorageState'],{env:{...cleanEnv(home),QT_QPA_PLATFORM:'offscreen',QT_QUICK_BACKEND:'software',QT_QPA_PLATFORMTHEME:'generic',QT_NO_XDG_DESKTOP_PORTAL:'1',TILDE_M4_POWER_STATE_DIR:home,TILDE_M4_POWER_MODE:mode,TILDE_M4_POWER_CONVERSATION:cid,TILDE_M4_POWER_SELECTION:revision},timeout:10000,maxBuffer:65536});
 const line=result.stdout.split('\n').find(s=>s.includes('M4_GUI_STORAGE_FACT '));assert.ok(line,'Native GUI storage fact missing');return JSON.parse(line.split('M4_GUI_STORAGE_FACT ')[1]!);
}
export async function openPowerFixture(home:string,{recover=false,allowShell=false,budgetPause=false}:{recover?:boolean;allowShell?:boolean;budgetPause?:boolean}={}){
 assert.equal(resolve(home),home);await mkdir(home,{recursive:true,mode:0o700});await mkdir(join(home,'run'),{recursive:true,mode:0o700});await mkdir(join(home,'work'),{recursive:true,mode:0o700});
 const paths=resolvePaths({XDG_RUNTIME_DIR:join(home,'run'),XDG_CONFIG_HOME:join(home,'config'),XDG_STATE_HOME:join(home,'state')},home,process.geteuid!());await preparePaths(paths,process.geteuid!());const config=await loadConfig(paths);
 if(!recover){await saveConfig(paths,config);await saveApiKey(openCredentialStore(config.authFile),'opencode-go','synthetic-m4-power-key');if(budgetPause){const limits=await loadWorkLimits(paths);await updateWorkLimits(paths,limits.revision,{...limits.settings,providerRequests:1});await writeFile(join(home,'work/read'),'synthetic read-only budget fixture',{mode:0o600});}}
 const faux=fauxProvider({provider:'opencode-go',models:[{id:'deepseek-v4.1-flash'}],tokensPerSecond:100000}),models=createModels();models.setProvider(faux.provider);
 faux.setResponses(budgetPause?[fauxAssistantMessage(fauxToolCall('fs_read',{path:join(home,'work/read')}),{stopReason:'toolUse'}),fauxAssistantMessage('requires explicit budget extension')]:[fauxAssistantMessage('committed synthetic power answer')]);let runtime!:ToolRuntime;let database!:Awaited<ReturnType<typeof openNodeSqliteDatabase>>,journal!:Journal;
 const agent=await openAgent({paths,config,databaseFactory:async path=>database=await openNodeSqliteDatabase(path),policyVersion:'m3',credentials:openCredentialStore(config.authFile),models,tooling:async sanitizer=>runtime=await createToolRuntime({paths,config:{version:1,roots:[join(home,'work')],retentionDays:7},sanitizer,journalFactory:path=>journal=openJournal(path)})});
 const pragmas=async()=>{
  const facts=[{store:'pi',activeConnection:true,journalMode:(await database.get<{journal_mode:string}>('PRAGMA journal_mode'))?.journal_mode,synchronous:(await database.get<{synchronous:number}>('PRAGMA synchronous'))?.synchronous,integrity:(await database.get<{integrity_check:string}>('PRAGMA integrity_check'))?.integrity_check},{store:'operations',activeConnection:true,journalMode:journal.db.prepare('PRAGMA journal_mode').get()!.journal_mode,synchronous:journal.db.prepare('PRAGMA synchronous').get()!.synchronous,integrity:journal.db.prepare('PRAGMA integrity_check').get()!.integrity_check}];
  for(const fact of facts){assert.equal(fact.journalMode,'wal');assert.equal(fact.synchronous,2);assert.equal(fact.integrity,'ok');}return facts;
 };
 return{agent,runtime,paths,config,faux,home,allowShell,pragmas,async close(){await agent.close();}};
}
export async function waitForPowerShellEffect(work:string){
 // Visibility precedes fsync completion. The shell publishes this disposable
 // marker only after both effect-file and working-directory fsyncs returned.
 await untilTool(()=>readFile(join(work,'effect.ready'),'utf8').catch(()=>''),v=>v==='fsynced\n');
 assert.equal(await readFile(join(work,'effect.log'),'utf8'),'effect\n');
}
export async function preparePowerState(home:string,scenario:PowerScenario,{allowShell=false,nativeGui=true}:{allowShell?:boolean;nativeGui?:boolean}={}){
 assert.ok(powerScenarios.includes(scenario));if(['effect-before-journal','owned-job'].includes(scenario))assert.equal(allowShell,true,'Separate exact synthetic shell-effect scope required');const f=await openPowerFixture(home,{allowShell,budgetPause:scenario==='budget-pause'});
 try{
 const cid=f.agent.conversations!.rootId,selection=(await loadSelection(f.paths)).selection;let expected:PowerExpected={scenario,rootId:cid,selectionRevision:selection.selectionRevision,rows:[],effectCount:0};
 if(['committed-state','catalog-ui'].includes(scenario)){
  await f.agent.conversations!.submit({conversationId:cid,requestId:'m4-power-input',text:'synthetic retained input',selectionRevision:selection.selectionRevision});
  await untilTool(()=>f.agent.conversations!.snapshot(cid),v=>v.state==='idle');
  const created=await f.agent.conversations!.create('m4-power-create');expected.createdId=created.conversation.id;
  if(nativeGui)expected.gui=await guiState(home,'prepare',expected.createdId,selection.selectionRevision);
 }
 if(scenario==='pending-approval'||scenario==='effect-before-journal'||scenario==='owned-job'){
  if(scenario!=='pending-approval')assert.equal(allowShell,true,'Separate exact synthetic shell-effect scope required');
  const request:ToolRequest={tool:'shell_run',args:{cwd:join(home,'work'),script:scenario==='pending-approval'?'printf never-authorized':powerShellScript,timeoutMs:30000}};
  void f.runtime.broker.execute({conversationId:cid,taskId:'900',callId:'m4-power-shell',generationId:'901'},request).catch(()=>{});
  let op=(await untilTool(()=>f.runtime.broker.snapshot(),v=>v.operations.some(o=>o.status==='awaiting_approval'))).operations[0]!;
  const details=await f.runtime.broker.details(op.id,op.fingerprint);assert.deepEqual(details.request,request);
  if(scenario!=='pending-approval'){
   await f.runtime.broker.decide({decisionId:'m4-power-exact-fixture-decision',operationId:op.id,fingerprint:op.fingerprint,decision:'approve_once'},process.geteuid!());
   await waitForPowerShellEffect(join(home,'work'));
   op=(await f.runtime.broker.snapshot()).operations[0]!;assert.equal(op.status,'running');expected.effectCount=1;
   const jobs=(await import('node:fs/promises')).readdir;const names=await jobs(join(f.paths.stateDir,'operations'));
   const payload=names.find(n=>n.startsWith('process-')&&n.endsWith('.payload.json'));
   assert.ok(payload,'Actual owned job payload missing');
   // Actual process identity is additionally retained by the broker's own files;
   // every boot mismatch must reconcile to unknown instead of launching again.
   expected.job={bootId:(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),operationId:op.id,attempt:op.attempt,...(payload?{payload:JSON.parse(await readFile(join(f.paths.stateDir,'operations',payload),'utf8'))}:{})};
  }
  expected.operation={...op,request};
 }
 if(scenario==='budget-pause'){
  await f.agent.conversations!.submit({conversationId:cid,requestId:'m4-power-budget',text:'synthetic budget pause',selectionRevision:selection.selectionRevision});
  expected.pause=(await untilTool(()=>f.agent.budgets!.pauses(),v=>v.length===1))[0];assert.equal(f.faux.state.callCount,1);
 }
 expected.rows=(await f.agent.conversations!.snapshot(cid)).rows;
 expected.pragmas=await f.pragmas();
 if(scenario==='catalog-ui'){
  // Deliberately remove only the documented derived catalog after a clean close;
  // the external oracle retains authoritative conversation and GUI identities.
  await f.close();for(const suffix of ['', '-wal','-shm'])await rm(join(f.paths.stateDir,'ui.sqlite'+suffix),{force:true});const directory=await open(f.paths.stateDir,'r');try{await directory.sync();}finally{await directory.close();}
 }
 return{...f,expected};
 }catch(error){await f.close();throw error;}
}
export async function recoverPowerState(home:string,expected:PowerExpected,{nativeGui=true}:{nativeGui?:boolean}={}){
 const f=await openPowerFixture(home,{recover:true});try{
  const view=await f.agent.conversations!.snapshot(expected.rootId);assert.deepEqual(view.rows,expected.rows);assert.equal((await loadSelection(f.paths)).selection.selectionRevision,expected.selectionRevision);
  assert.equal(f.faux.state.callCount,0,'Recovery must not dispatch a model request for these idle/pending/unknown fixtures');
  if(expected.createdId){const history=await f.agent.conversations!.snapshot(expected.createdId);assert.equal(history.conversationId,expected.createdId);const catalog=await f.agent.conversations!.list({query:''});assert.ok(catalog.conversations.some(c=>c.id===expected.createdId));}
  if(expected.gui&&nativeGui)assert.deepEqual(await guiState(home,'recover',expected.createdId!,expected.selectionRevision),expected.gui);
  if(expected.operation){
   await f.runtime.broker.reconcile();const op=(await f.runtime.broker.snapshot()).operations.find(o=>o.id===expected.operation!.id);assert.ok(op);assert.equal(op.fingerprint,expected.operation.fingerprint);assert.equal(op.attempt,expected.operation.attempt);
   assert.equal(op.status,expected.scenario==='pending-approval'?'awaiting_approval':'outcome_unknown');
   if(expected.scenario==='pending-approval')assert.deepEqual((await f.runtime.broker.details(op.id,op.fingerprint)).request,expected.operation.request);
   if(expected.job){
    const job=expected.job as {bootId:string;operationId:string;attempt:number;payload:{id:string;bootId:string}};
    assert.match(job.operationId,/^[a-f0-9]{64}$/);assert.equal(job.operationId,op.id);assert.equal(job.attempt,op.attempt);assert.equal(job.payload.id,op.id);assert.equal(job.payload.bootId,job.bootId);
    assert.notEqual((await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),job.bootId,'Actual VM reopen must have a different boot identity');
    assert.deepEqual(JSON.parse(await readFile(join(f.paths.stateDir,'operations','process-'+op.id+'.payload.json'),'utf8')),job.payload);
   }
   const journal=openJournal(join(f.paths.stateDir,'operations.sqlite'));try{const record=journal.get(op.id)!;assert.equal(record.approvalConsumed,expected.scenario!=='pending-approval');}finally{journal.close();}
  }
  if(expected.pause)assert.deepEqual((await f.runtime.budgetGate.pauses())[0],expected.pause);
  const effect=await readFile(join(home,'work/effect.log'),'utf8').catch(()=>''),count=effect.split('\n').filter(Boolean).length;assert.equal(count,expected.effectCount);assert.ok(count<=1);
  return{pragmas:await f.pragmas(),scenario:expected.scenario,verdict:'pass',originalIdentities:true,noRedispatch:true,effectCount:count,providerCalls:f.faux.state.callCount,scope:'actual product stores under calibrated guest volatile-cache model; stores are separately committed'};
 }finally{await f.close();}
}
async function guestScope(path:string,scenario:PowerScenario){
 assert.equal(resolve(path),path);const parent=await lstat(dirname(path));assert.equal(parent.uid,process.geteuid!());assert.equal(parent.mode&0o777,0o700);
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let value:any;try{const s=await fd.stat();assert.ok(s.isFile()&&s.nlink===1&&s.uid===process.geteuid!()&&(s.mode&0o777)===0o600&&s.size<=16384);value=JSON.parse(await fd.readFile('utf8'));}finally{await fd.close();}
 assert.equal(value.version,1);assert.equal(value.ownerApproved,true);assert.equal(value.syntheticOnly,true);assert.ok(value.scenarios.includes(scenario));assert.ok(Date.parse(value.expiresAt)>Date.now());assert.equal(value.home,'/mnt/tilde-m4-power/home');
 const observation=JSON.parse((await exec('/usr/bin/sudo',['-n',helper,'preflight'],{timeout:10000,maxBuffer:65536})).stdout);assert.equal(observation.uuid,value.targetUUID);assert.equal(observation.mount,'/mnt/tilde-m4-power');assert.equal(observation.mountSource,'/dev/nbd0');assert.ok(observation.mountOptions.split(',').includes('noexec'));
 if(['effect-before-journal','owned-job'].includes(scenario)){assert.equal(value.allowOneSyntheticShellEffect,true);assert.equal(value.shellScriptSha256,createHash('sha256').update(powerShellScript).digest('hex'));}
 return value;
}
async function main(){
 const[action,scenario,path]=process.argv.slice(2);assert.ok(action==='prepare'||action==='recover');assert.ok(powerScenarios.includes(scenario as PowerScenario));const scope=await guestScope(path!,scenario as PowerScenario);
 if(action==='prepare'){
  const fixture=await preparePowerState(scope.home,scenario as PowerScenario,{allowShell:scope.allowOneSyntheticShellEffect===true});
  const trace=JSON.parse((await exec('/usr/bin/sudo',['-n',helper,'read-trace'],{timeout:10000,maxBuffer:17*1024*1024})).stdout);const last=trace.events.at(-1);assert.ok(last);
  const ack={version:1,kind:'application',scenario,phase:'held',targetUUID:scope.targetUUID,bootId:(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),backendInstance:last.instance,backendSeq:last.seq,expected:fixture.expected};
  process.stdout.write(JSON.stringify(ack)+'\n',()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0));
 }else{
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>65536)throw Error('POWER_ORACLE_LIMIT');}const ack=JSON.parse(raw);assert.equal(ack.targetUUID,scope.targetUUID);assert.equal(ack.scenario,scenario);const result=await recoverPowerState(scope.home,ack.expected);console.log(JSON.stringify(result));
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().catch(e=>{console.error(e instanceof Error?e.message:'POWER_WORKER_FAILED');process.exitCode=1;});
