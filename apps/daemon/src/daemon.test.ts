import { test,type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { openAgent,type AgentSession } from '@tilde/agent';
import { resolvePaths,preparePaths,loadConfig,saveConfig,publicSettings,type AppConfig } from '@tilde/config';
import { openCredentialStore,saveApiKey } from '@tilde/credentials';
import { scripted } from '../../../packages/agent/dist/fixtures/provider.js';
import { startDaemon } from './daemon.js';
import { Client } from './fixtures/client.js';
async function fixture(t:TestContext,custom?:typeof openAgent,auth=true){const home=await mkdtemp(join(tmpdir(),'tilde-daemon-'));t.after(()=>rm(home,{recursive:true,force:true}));await mkdir(join(home,'run'),{mode:0o700});const paths=resolvePaths({XDG_RUNTIME_DIR:join(home,'run')},home,process.geteuid!());await preparePaths(paths,process.geteuid!());const config=await loadConfig(paths);await saveConfig(paths,config);if(auth)await saveApiKey(openCredentialStore(config.authFile),'opencode-go','daemon-synthetic-canary');const daemon=await startDaemon({paths,config,agentFactory:custom??(o=>openAgent({...o,models:scripted().models}))});t.after(()=>daemon.close());return {home,paths,config,daemon,revision:publicSettings(config,paths).selectionRevision};}
async function connect(t:TestContext,path:string){const c=new Client(path);t.after(()=>c.close());const hello=await c.ready();assert.equal(hello.ok,true);return c;}
const result=(frame:Record<string,unknown>)=>frame.result as Record<string,unknown>;
const chat=(frame:Record<string,unknown>)=>result(frame).chat as Record<string,unknown>;
const error=(frame:Record<string,unknown>)=>(frame.error as Record<string,unknown>)?.code;
test('durable ACK precedes model completion; disconnect does not cancel and reconnect has one input',async t=>{
 const f=await fixture(t);const c=await connect(t,f.paths.socketPath);const ack=await c.request('conversation.submit',{requestId:'first',text:'hi',selectionRevision:f.revision});assert.equal(ack.ok,true);
 assert.equal(chat(await c.request('conversation.get',{})).state,'running');c.close();await delay(800);const other=await connect(t,f.paths.socketPath);const view=chat(await other.request('conversation.get',{}));assert.equal(view.state,'idle');assert.equal((view.rows as unknown[]).length,2);
 const dedup=await other.request('conversation.submit',{requestId:'first',text:'changed',selectionRevision:'stale'});assert.equal(result(dedup).deduplicated,true);
});
test('busy settings and store changes reject without partial config; stale revision never writes another store',async t=>{
 // Hold the synthetic response until these BUSY assertions have completed;
 // elapsed wall time is not evidence that a run is still admitted.
 let release!:()=>void;const held=new Promise<void>(r=>{release=r;});
 const provider=scripted();provider.faux.setResponses([async()=>{await held;return (await import('@earendil-works/pi-ai/providers/faux')).fauxAssistantMessage('held synthetic response');}]);
 const f=await fixture(t,o=>openAgent({...o,models:provider.models}));const c=await connect(t,f.paths.socketPath);const old=await readFile(f.paths.configFile,'utf8');
 try{await c.request('conversation.submit',{requestId:'run',text:'hi',selectionRevision:f.revision});
 assert.equal(error(await c.request('settings.update',{expectedRevision:f.revision,next:{...f.config,modelId:'other'}})),'BUSY');
 assert.equal(error(await c.request('credentials.store',{expectedSelectionRevision:f.revision,providerId:'opencode-go',key:'new-synthetic'})),'BUSY');assert.ok(await readFile(f.paths.configFile,'utf8')===old);
 release();await c.request('conversation.cancel',{});const next={...f.config,authFile:join(f.home,'separate.json')};const updated=await c.request('settings.update',{expectedRevision:f.revision,next});assert.equal(updated.ok,true);
 assert.equal(error(await c.request('credentials.store',{expectedSelectionRevision:f.revision,providerId:'opencode-go',key:'new-synthetic'})),'SETTINGS_CHANGED');await assert.rejects(readFile(next.authFile),{code:'ENOENT'});
 }finally{release();}
});
test('missing auth keeps setup IPC/transcript available; key input is never echoed and allows next turn',async t=>{
 const f=await fixture(t,undefined,false);const c=await connect(t,f.paths.socketPath);
 assert.equal(error(await c.request('conversation.submit',{requestId:'no-key',text:'hi',selectionRevision:f.revision})),'AUTH_REQUIRED');assert.equal((chat(await c.request('conversation.get',{})).rows as unknown[]).length,0);
 const stored=await c.request('credentials.store',{expectedSelectionRevision:f.revision,providerId:'opencode-go',key:'daemon-synthetic-canary'});assert.equal(stored.ok,true);
 assert.ok(!JSON.stringify(c.frames).includes('daemon-synthetic-canary'));assert.equal((await c.request('conversation.submit',{requestId:'with-key',text:'hi',selectionRevision:f.revision})).ok,true);
});
test('invalid coalesced frame is terminal before queued submit mutation reaches Pi',async t=>{
 const f=await fixture(t);const c=await connect(t,f.paths.socketPath);const closed=once(c.socket,'close');
 c.socket.write('{}\n'+JSON.stringify({v:3,id:'bad-followup',method:'conversation.submit',params:{requestId:'must-not-run',text:'no',selectionRevision:f.revision}})+'\n');await closed;
 const other=await connect(t,f.paths.socketPath);assert.equal((chat(await other.request('conversation.get',{})).rows as unknown[]).length,0);
});
test('snapshot acquisition barrier permits another client submit; replacement and close dispose watches',async t=>{
 let release!:()=>void;let attached!:()=>void;const holding=new Promise<void>(r=>{release=r;});const acquired=new Promise<void>(r=>{attached=r;});let stops=0;let first=true;
 const f=await fixture(t,async o=>{const agent=await openAgent({...o,models:scripted().models});return {...agent,conversations:{...agent.conversations!,watch:async (cid,listener)=>{const w=await agent.conversations!.watch(cid,listener);if(first){first=false;attached();await holding;}return {...w,stop:async()=>{stops++;await w.stop();}};}}};});
 const c=await connect(t,f.paths.socketPath);const pending=c.request('conversation.subscribe',{});await acquired;
 const other=await connect(t,f.paths.socketPath);await other.request('conversation.submit',{requestId:'overlap',text:'hi',selectionRevision:f.revision});await delay(800);release();const initial=await pending;assert.equal(initial.ok,true);await delay(30);
 const events=c.frames.filter(frame=>'event' in frame);const last=events.at(-1);const authoritative=last&&'view'in last?last.view:(result(initial).view as import('@tilde/protocol').SelectedView);assert.equal(authoritative.chat.rows.length,2);assert.equal(new Set(authoritative.chat.rows.map(e=>e.id)).size,2);
 await c.request('conversation.subscribe',{});assert.ok(stops>=1);c.close();await delay(20);assert.ok(stops>=2);
});
test('close during asynchronous watch acquisition disposes acquired resource once',async t=>{
 let release!:()=>void;let attached!:()=>void;const hold=new Promise<void>(r=>{release=r;});const acquired=new Promise<void>(r=>{attached=r;});let stops=0;
 const f=await fixture(t,async o=>{const a=await openAgent({...o,models:scripted().models});return {...a,conversations:{...a.conversations!,watch:async (cid,listener)=>{const w=await a.conversations!.watch(cid,listener);attached();await hold;return {...w,stop:async()=>{stops++;await w.stop();}};}}};});
 const c=await connect(t,f.paths.socketPath);const pending=c.request('conversation.subscribe',{}).catch(()=>{});await acquired;c.close();await pending;release();await delay(30);assert.equal(stops,1);
});
test('pending-handler overflow closes only offender; hello deadline is enforced',async t=>{
 const f=await fixture(t);const c=await connect(t,f.paths.socketPath);const closed=once(c.socket,'close');c.socket.write(Array.from({length:33},(_,i)=>JSON.stringify({v:3,id:'read-'+i,method:'conversation.get',params:{conversationId:c.rootConversationId}})+'\n').join(''));await closed;
 const other=await connect(t,f.paths.socketPath);assert.equal((await other.request('conversation.get',{})).ok,true);
 const silent=new Client(f.paths.socketPath);t.after(()=>silent.close());await once(silent.socket,'connect');await once(silent.socket,'close');
});
test('interrupted work stays gated after key setup until explicit Resume once',async t=>{
 const f=await fixture(t,async o=>{const a=await openAgent({...o,models:scripted().models});await a.submit({requestId:'pending-auth',text:'resume after setup',selectionRevision:publicSettings(o.config as AppConfig,o.paths).selectionRevision});while(!(await a.snapshot()).partial?.text)await delay(10);await a.close();await rm(o.config.authFile);return openAgent({...o,models:scripted().models});});
 const c=await connect(t,f.paths.socketPath);const stored=await c.request('credentials.store',{expectedSelectionRevision:f.revision,providerId:'opencode-go',key:'daemon-synthetic-canary'});assert.equal(stored.ok,true);
 const before=chat(await c.request('conversation.get',{}));assert.equal(before.state,'blocked');const hello=await c.wire('system.hello',{});const repair=hello.result.settings.authRecovery;assert.ok(repair);const {target,...identity}=repair.owner;const resumed=await c.wire('conversation.resume',{intent:{...identity,intentId:'explicit-native-resume'}});assert.equal(resumed.result.outcome,'accepted');
 await delay(800);const view=chat(await c.request('conversation.get',{}));assert.equal(view.state,'idle');assert.equal((view.rows as {role:string}[]).filter(e=>e.role==='user').length,1);assert.deepEqual((view.rows as {role:string;stopReason?:string}[]).filter(e=>e.role==='assistant').map(e=>e.stopReason),['aborted','stop']);
});
test('replacement snapshots rotate subscription identity and restart sequence at zero',async()=>{
 const {Subscription}=await import('./subscriptions.js');let changed!:Parameters<import('./tool-subscriptions.js').WorkspaceSource['watch']>[0];let release!:()=>void;const held=new Promise<void>(r=>{release=r;});const frames:import('@tilde/protocol').V4ServerFrame[]=[];
 const view:import('@tilde/protocol').SelectedView={chat:{conversationId:'1',rows:[],state:'idle'},activity:{conversationId:'1',revision:'0',operations:[]},work:{revision:'0',status:'ready',attention:[],catalogStatus:'ready',desktopStatus:'disabled'}};
 const lane=new Subscription(()=>({snapshot:async()=>view,watch:async listener=>{changed=listener;await held;return{snapshot:view,stop:async()=>{}};}}),'epoch',()=>({selection:{version:2,connectionId:'builtin:opencode-go',definitionRevision:'a'.repeat(64),providerId:'opencode-go',modelId:'fixture',authFile:'/private/auth',store:'separate',selectionRevision:'revision'},selectedModel:null,credential:null,admission:{canSubmit:true,blockedBy:'none'},registryRevision:'registry'}),f=>{frames.push(f);return true;},()=>true);
 const pending=lane.attach('1');await delay(0);for(let i=0;i<130;i++)changed({kind:'update',view});release();const initial=await pending;initial.afterSend();const snapshot=frames.find(f=>'event'in f&&f.event==='conversation.snapshot');assert.ok(snapshot&&'subscriptionId'in snapshot);assert.notEqual(snapshot.subscriptionId,initial.result.subscriptionId);assert.equal(snapshot.seq,'0');await lane.close();
});
test('per-client request-rate limit closes only the offending connection',async t=>{
 const f=await fixture(t);const c=await connect(t,f.paths.socketPath);for(let i=0;i<127;i++)assert.equal((await c.request('ui.settings.get',{})).ok,true);
 await assert.rejects(c.request('ui.settings.get',{}),/CLIENT_CLOSED/);const other=await connect(t,f.paths.socketPath);assert.equal((await other.request('settings.get',{})).ok,true);
});
test('final review: resume uses admitted store even when next-turn config points at a missing store',async t=>{
 let providerCalls=()=>0;
 const f=await fixture(t,async o=>{const first=await openAgent({...o,models:scripted().models});await first.submit({requestId:'retained-store',text:'retained run',selectionRevision:publicSettings(o.config as AppConfig,o.paths).selectionRevision});while(!(await first.snapshot()).partial?.text)await delay(10);await first.close();const next={...o.config,authFile:join(o.paths.stateDir,'next-missing.json')};await saveConfig(o.paths,next as AppConfig);const fresh=scripted();providerCalls=()=>fresh.faux.state.callCount;return openAgent({...o,config:next,models:fresh.models});});
 const c=await connect(t,f.paths.socketPath);await delay(800);const view=chat(await c.request('conversation.get',{}));assert.equal(providerCalls(),1);assert.equal(view.state,'idle');assert.deepEqual((view.rows as {role:string;stopReason?:string}[]).filter(e=>e.role==='assistant').map(e=>e.stopReason),['aborted','stop']);
});
test('final review: missing admitted credentials block recovery without a provider call',async t=>{
 let providerCalls=()=>0;
 const f=await fixture(t,async o=>{const first=await openAgent({...o,models:scripted().models});await first.submit({requestId:'missing-retained',text:'retained run',selectionRevision:publicSettings(o.config as AppConfig,o.paths).selectionRevision});while(!(await first.snapshot()).partial?.text)await delay(10);await first.close();await rm(o.config.authFile);const next={...o.config,authFile:join(o.paths.stateDir,'next-valid.json')};await saveConfig(o.paths,next as AppConfig);await saveApiKey(openCredentialStore(next.authFile),'opencode-go','unrelated-fixture-key');const fresh=scripted();providerCalls=()=>fresh.faux.state.callCount;return openAgent({...o,config:next,models:fresh.models});});
 const c=await connect(t,f.paths.socketPath);await delay(800);const view=chat(await c.request('conversation.get',{}));assert.equal(providerCalls(),0);assert.equal(view.state,'blocked');assert.equal(view.errorCode,'AUTH_REQUIRED');assert.equal((await c.request('conversation.cancel',{})).ok,true);
});
test('final review: corrupt credential store leaves catalog and separate-store selection usable',async t=>{
 const f=await fixture(t);await writeFile(f.config.authFile,'{corrupt',{mode:0o600});const c=await connect(t,f.paths.socketPath);
 const hello=result(await c.request('system.hello',{}));assert.equal((hello.credential as {errorCode:string}).errorCode,'INVALID_CREDENTIAL_JSON');
 const listed=await c.request('models.list',{});assert.equal(listed.ok,true);assert.ok((result(listed).models as unknown[]).length>0);
 const next={...f.config,authFile:join(f.home,'new-private-store.json')};const changed=await c.request('settings.update',{expectedRevision:f.revision,next});assert.equal(changed.ok,true);
 assert.ok(await readFile(f.config.authFile,'utf8')==='{corrupt');
 const revision=(result(changed).selectionRevision as string);assert.equal((await c.request('credentials.store',{expectedSelectionRevision:revision,providerId:'opencode-go',key:'new-synthetic-key'})).ok,true);
});
