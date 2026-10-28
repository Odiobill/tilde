import { test,type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,readFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { openNodeSqliteDatabase } from '@earendil-works/pi-durable/storage/sqlite/node';
import { resolvePaths,preparePaths,loadConfig,saveConfig,publicSettings } from '@tilde/config';
import { openCredentialStore,saveApiKey } from '@tilde/credentials';
import { openAgent,createOpenCodeModels,type AgentSession } from './index.js';
import { scripted } from './fixtures/provider.js';
async function fixture(t:TestContext){const home=await mkdtemp(join(tmpdir(),'tilde-agent-'));t.after(()=>rm(home,{recursive:true,force:true}));await mkdir(join(home,'run'),{mode:0o700});const paths=resolvePaths({XDG_RUNTIME_DIR:join(home,'run')},home,process.geteuid!());await preparePaths(paths,process.geteuid!());const config=await loadConfig(paths);await saveConfig(paths,config);const credentials=openCredentialStore(config.authFile);await saveApiKey(credentials,'opencode-go','agent-synthetic-canary');return {paths,config,credentials};}
async function finished(agent:AgentSession){for(let i=0;i<500;i++){const view=await agent.snapshot();if(view.state!=='running')return view;await delay(10);}throw new Error('FIXTURE_TIMEOUT');}
test('real Pi/SQLite uses WAL/FULL on live connection and reopen with one writer',async t=>{
 const f=await fixture(t);let db:Awaited<ReturnType<typeof openNodeSqliteDatabase>>|undefined;
 const agent=await openAgent({...f,models:scripted().models,databaseFactory:async(...args)=>{db=await openNodeSqliteDatabase(...args);return db;}});t.after(()=>agent.close());
 assert.equal((await db!.get<{journal_mode:string}>('PRAGMA journal_mode'))?.journal_mode,'wal');assert.equal((await db!.get<{synchronous:number}>('PRAGMA synchronous'))?.synchronous,2);
 await assert.rejects(openAgent({...f,models:scripted().models}));await agent.close();
 const reopened=await openAgent({...f,models:scripted().models,databaseFactory:async(...args)=>{db=await openNodeSqliteDatabase(...args);return db;}});t.after(()=>reopened.close());assert.equal((await db!.get<{synchronous:number}>('PRAGMA synchronous'))?.synchronous,2);
});
test('duplicate request precedes stale revision/busy checks and new busy input writes nothing',async t=>{
 const f=await fixture(t);const {models,faux}=scripted();const agent=await openAgent({...f,models});t.after(()=>agent.close());const revision=publicSettings(f.config,f.paths).selectionRevision;
 const first=await agent.submit({requestId:'same',text:'original input',selectionRevision:revision});
 const duplicate=await agent.submit({requestId:'same',text:'changed',selectionRevision:'stale'});assert.equal(duplicate.submissionId,first.submissionId);assert.equal(duplicate.deduplicated,true);
 await assert.rejects(agent.submit({requestId:'busy',text:'must not write',selectionRevision:revision}),/BUSY/);
 const view=await finished(agent);assert.equal(view.entries.filter(e=>e.role==='user').length,1);assert.equal(view.entries[0]?.text,'original input');assert.equal(faux.state.callCount,1);
 const ids=view.entries.map(e=>e.id);await agent.close();const second=await openAgent({...f,models:scripted().models});t.after(()=>second.close());assert.deepEqual((await second.snapshot()).entries.map(e=>e.id),ids);
});
test('stale selection rejects before provider call and admitted idle turn reloads model config',async t=>{
 const f=await fixture(t);const {models,faux}=scripted();const agent=await openAgent({...f,models});t.after(()=>agent.close());
 await saveConfig(f.paths,{...f.config,modelId:'other'});await assert.rejects(agent.submit({requestId:'stale',text:'no',selectionRevision:publicSettings(f.config,f.paths).selectionRevision}),/SETTINGS_CHANGED/);assert.equal(faux.state.callCount,0);
 assert.equal((await agent.snapshot()).entries.length,0);const config=await loadConfig(f.paths);await agent.submit({requestId:'new',text:'hello',selectionRevision:publicSettings(config,f.paths).selectionRevision});const view=await finished(agent);assert.equal(view.entries.at(-1)?.model?.modelId,'other');
});
test('atomic watch streams at least two partial updates before final and reads never start scheduling',async t=>{
 const f=await fixture(t);const {models,faux}=scripted();const agent=await openAgent({...f,models});t.after(()=>agent.close());const partials:string[]=[];
 const watch=await agent.watch(e=>{if(e.view.partial?.text)partials.push(e.view.partial.text);});t.after(()=>watch.stop());assert.equal(watch.snapshot.entries.length,0);await agent.snapshot();assert.equal(faux.state.callCount,0);
 await agent.submit({requestId:'stream',text:'hi',selectionRevision:publicSettings(f.config,f.paths).selectionRevision});const view=await finished(agent);assert.ok(new Set(partials).size>=2);assert.equal(view.entries.length,2);assert.equal(view.partial,undefined);
});
test('provider errors and unsolicited tools become safe failures before durable persistence',async t=>{
 for(const mode of ['error','tool'] as const){const f=await fixture(t);const agent=await openAgent({...f,models:scripted(mode).models});t.after(()=>agent.close());
 await agent.submit({requestId:mode,text:'hello',selectionRevision:publicSettings(f.config,f.paths).selectionRevision});const view=await finished(agent);assert.equal(view.state,'failed');assert.equal(view.errorCode,mode==='tool'?'TOOLS_DISABLED':'PROVIDER_FAILED');assert.ok(!JSON.stringify(view).includes('agent-synthetic-canary'));await agent.close();
 for(const name of await readdir(f.paths.stateDir)){const data=await readFile(join(f.paths.stateDir,name));assert.ok(!data.includes(Buffer.from('agent-synthetic-canary')),'persisted state contains no secret');}
 }
});
test('SIGKILL midstream reopens original input before resume; reads do not trigger it',async t=>{
 const f=await fixture(t);const child=fork(new URL('./fixtures/session-child.js',import.meta.url),[JSON.stringify({paths:f.paths,config:f.config})],{stdio:['ignore','ignore','ignore','ipc']});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw new Error('CHILD_EXIT_BEFORE_READY');})]);child.kill('SIGKILL');await once(child,'exit');
 await saveConfig(f.paths,{...f.config,modelId:'other'});
 const {models,faux}=scripted();const agent=await openAgent({...f,config:await loadConfig(f.paths),models});t.after(()=>agent.close());const before=await agent.snapshot();assert.equal(before.entries.filter(e=>e.role==='user').length,1);const user=before.entries.find(e=>e.role==='user')!.id;
 const watch=await agent.watch(()=>{});await watch.stop();await delay(30);assert.equal(faux.state.callCount,0);agent.resume();const view=await finished(agent);assert.equal(view.state,'idle');assert.equal(view.entries.filter(e=>e.role==='assistant').length,1);assert.equal(view.entries.at(-1)?.model?.modelId,'deepseek-v4.1-flash');assert.equal(view.entries.filter(e=>e.role==='user').length,1);assert.equal(view.entries.find(e=>e.role==='user')?.id,user);assert.equal(new Set(view.entries.map(e=>e.id)).size,view.entries.length);
});
test('pinned OpenCode fetch seam sends Tilde headers, stable session, output cap and stored key',async t=>{
 const f=await fixture(t);const captures:{headers:Headers;body:Record<string,unknown>}[]=[];
 const fetch:typeof globalThis.fetch=async(_url,init)=>{
  captures.push({headers:new Headers(init?.headers),body:JSON.parse(String(init?.body))});
  const chunks=[{id:'fixture',object:'chat.completion.chunk',created:1,model:'deepseek-v4.1-flash',choices:[{index:0,delta:{role:'assistant',content:'OpenCode fixture'},finish_reason:null}]},{id:'fixture',object:'chat.completion.chunk',created:1,model:'deepseek-v4.1-flash',choices:[{index:0,delta:{},finish_reason:'stop'}]}];
  return new Response(chunks.map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
 };
 for(let n=0;n<2;n++){const agent=await openAgent({...f,models:createOpenCodeModels(f.credentials,fetch)});t.after(()=>agent.close());await agent.submit({requestId:'http-'+n,text:'hello',selectionRevision:publicSettings(f.config,f.paths).selectionRevision});assert.equal((await finished(agent)).state,'idle');await agent.close();}
 assert.equal(captures.length,2);for(const c of captures){assert.ok(c.headers.get('authorization')==='Bearer agent-synthetic-canary');assert.equal(c.headers.get('user-agent'),'Tilde/0.1.0');assert.equal(c.body.max_tokens??c.body.max_completion_tokens,8192);assert.ok(c.headers.get('x-opencode-session'));}
 assert.equal(captures[0]!.headers.get('x-opencode-session'),captures[1]!.headers.get('x-opencode-session'));
});
test('provider deadline terminates even a stream ignoring abort; errors are safe codes',async()=>{
 const {withRequestLimits}=await import('./request-limits.js');const {AssistantMessageEventStream}=await import('@earendil-works/pi-ai/utils/event-stream');
 const {models}=scripted();models.streamSimple=()=>new AssistantMessageEventStream();
 const limited=withRequestLimits(models,20);const message=await Promise.race([limited.streamSimple(models.getModels()[0]!,{messages:[]}).result(),delay(300).then(()=>{throw new Error('DEADLINE_NOT_ENFORCED');})]);
 assert.equal(message.stopReason,'error');assert.equal(message.errorMessage,'PROVIDER_TIMEOUT');
});
test('401, 429 and malformed OpenCode response persist typed failed state without provider body',async t=>{
 for(const status of [401,429,200]){const f=await fixture(t);const fetch:typeof globalThis.fetch=async()=>new Response('agent-synthetic-canary',{status,headers:{'content-type':status===200?'application/json':'text/plain'}});
 const agent=await openAgent({...f,models:createOpenCodeModels(f.credentials,fetch)});t.after(()=>agent.close());await agent.submit({requestId:'failure',text:'hi',selectionRevision:publicSettings(f.config,f.paths).selectionRevision});const view=await finished(agent);assert.equal(view.state,'failed');assert.ok(!JSON.stringify(view).includes('agent-synthetic-canary'));assert.equal(view.errorCode,status===401?'AUTH_REQUIRED':status===429?'RATE_LIMITED':'PROVIDER_FAILED');
 }
});
test('disk transaction failure never returns an accepted submission or persists input',async t=>{
 const f=await fixture(t);let fail=false;
 const agent=await openAgent({...f,models:scripted().models,databaseFactory:async(...args)=>{const db=await openNodeSqliteDatabase(...args);const transaction=db.transaction.bind(db);db.transaction=async fn=>{if(fail)throw new Error('ENOSPC');return transaction(fn);};return db;}});t.after(()=>agent.close());fail=true;
 await assert.rejects(agent.submit({requestId:'disk-full',text:'not admitted',selectionRevision:publicSettings(f.config,f.paths).selectionRevision}));await agent.close();
 const reopened=await openAgent({...f,models:scripted().models});t.after(()=>reopened.close());assert.equal((await reopened.snapshot()).entries.length,0);
});
test('second consecutive stream crash parks visibly; Cancel permits an explicit new Send',async t=>{
 const f=await fixture(t);
 for(const mode of ['submit','resume']){
  const child=fork(new URL('./fixtures/session-child.js',import.meta.url),[JSON.stringify({paths:f.paths,config:f.config}),mode],{stdio:['ignore','ignore','ignore','ipc']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw new Error('CHILD_EXIT_BEFORE_READY');})]);child.kill('SIGKILL');await once(child,'exit');
 }
 const agent=await openAgent({...f,models:scripted().models});t.after(()=>agent.close());const view=await agent.snapshot();assert.equal(view.state,'blocked');assert.equal(view.errorCode,'RESTART_LIMIT');
 await assert.rejects(agent.submit({requestId:'new-before-cancel',text:'no',selectionRevision:publicSettings(f.config,f.paths).selectionRevision}),/BUSY/);
 await agent.cancel();await agent.submit({requestId:'explicit-new',text:'fresh',selectionRevision:publicSettings(f.config,f.paths).selectionRevision});assert.equal((await finished(agent)).state,'idle');
});
test('watch attachment during partial and reconnect reconstruct each authoritative entry once',async t=>{
 const f=await fixture(t);const agent=await openAgent({...f,models:scripted().models});t.after(()=>agent.close());
 await agent.submit({requestId:'overlap',text:'overlap',selectionRevision:publicSettings(f.config,f.paths).selectionRevision});
 while(!(await agent.snapshot()).partial?.text)await delay(10);
 let later:import('@tilde/protocol').ChatView|undefined;const watch=await agent.watch(event=>{later=event.view;});t.after(()=>watch.stop());assert.ok(watch.snapshot.partial?.text);
 const final=await finished(agent);assert.equal(final.entries.length,2);await delay(20);assert.deepEqual(later?.entries.map(e=>e.id),final.entries.map(e=>e.id));
 const reconnect=await agent.watch(()=>{});await reconnect.stop();assert.deepEqual(reconnect.snapshot.entries.map(e=>e.id),final.entries.map(e=>e.id));
});
test('final review: mid-generation disk failure publishes and snapshots terminal STORAGE_FAILED',async t=>{
 const f=await fixture(t);let fail=false;const updates:import('@tilde/protocol').ChatView[]=[];
 const agent=await openAgent({...f,models:scripted().models,databaseFactory:async(...args)=>{const db=await openNodeSqliteDatabase(...args);const transaction=db.transaction.bind(db);db.transaction=async fn=>{if(fail)throw new Error('ENOSPC synthetic failure');return transaction(fn);};return db;}});t.after(()=>agent.close());
 const watch=await agent.watch(event=>updates.push(event.view));t.after(()=>watch.stop());await agent.submit({requestId:'mid-disk',text:'keep admitted input',selectionRevision:publicSettings(f.config,f.paths).selectionRevision});
 while(!updates.some(v=>v.partial?.text))await delay(10);fail=true;await delay(800);
 assert.equal(updates.at(-1)?.state,'blocked');assert.equal(updates.at(-1)?.errorCode,'STORAGE_FAILED');const view=await agent.snapshot();assert.equal(view.state,'blocked');assert.equal(view.errorCode,'STORAGE_FAILED');assert.equal(view.entries.filter(e=>e.role==='user').length,1);
 await assert.rejects(agent.submit({requestId:'after-failure',text:'never accepted',selectionRevision:publicSettings(f.config,f.paths).selectionRevision}));
});
test('live regression: thinking-only length result is a typed OUTPUT_LIMIT failure',async t=>{
 const f=await fixture(t);const agent=await openAgent({...f,models:scripted('thinking').models});t.after(()=>agent.close());
 await agent.submit({requestId:'thinking-cap',text:'a useful visible answer is required',selectionRevision:publicSettings(f.config,f.paths).selectionRevision});const view=await finished(agent);
 assert.equal(view.state,'failed');assert.equal(view.errorCode,'OUTPUT_LIMIT');assert.ok(!JSON.stringify(view).includes('internal fixture reasoning'));assert.equal(view.partial,undefined);
});
test('owner-approved budget applies only to the DeepSeek target and retains deadline/retry bounds',async()=>{
 const {withRequestLimits}=await import('./request-limits.js');const {models}=scripted();const observed:{modelId:string;tokens:number|undefined;timeout:number|undefined;retries:number|undefined}[]=[];
 const original=models.streamSimple.bind(models);models.streamSimple=(model,context,options)=>{observed.push({modelId:model.id,tokens:options?.maxTokens,timeout:options?.timeoutMs,retries:options?.maxRetries});return original(model,context,options);};const limited=withRequestLimits(models);
 for(const id of ['deepseek-v4.1-flash','other'])await limited.streamSimple(models.getModel('opencode-go',id)!,{messages:[]}).result();
 assert.deepEqual(observed,[{modelId:'deepseek-v4.1-flash',tokens:8192,timeout:60000,retries:0},{modelId:'other',tokens:2048,timeout:60000,retries:0}]);
});
test('empty successful provider response is a typed EMPTY_RESPONSE failure',async t=>{
 const f=await fixture(t);const agent=await openAgent({...f,models:scripted('empty').models});t.after(()=>agent.close());await agent.submit({requestId:'empty-result',text:'visible answer required',selectionRevision:publicSettings(f.config,f.paths).selectionRevision});const view=await finished(agent);assert.equal(view.state,'failed');assert.equal(view.errorCode,'EMPTY_RESPONSE');
});
