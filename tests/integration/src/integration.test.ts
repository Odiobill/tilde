import{privateEnvironment}from'./private-environment.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readiness,transientLifecycle } from './lifecycle.js';
test('readiness rejects exact exit42, signal, missing output and timeout with bounded diagnostics',async()=>{
 for(const [source,expected] of [["process.exit(42)",'READINESS_EXIT_42'],["process.kill(process.pid,'SIGTERM')",'READINESS_SIGNAL_SIGTERM'],["process.exit(0)",'READINESS_MISSING_OUTPUT'],["setTimeout(()=>{},1000)",'READINESS_TIMEOUT']] as const){const child=spawn(process.execPath,['-e',source],{stdio:['ignore','pipe','pipe']});try{await assert.rejects(readiness(child,'ready',expected==='READINESS_TIMEOUT'?30:1000),e=>e instanceof Error&&e.message===expected);}finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}
});
test('compiled daemon/GUI close-reopen and SIGKILL recovery retain original IDs',async()=>{
 const {sourceRecovery}=await import('./recovery.js');const proof=await sourceRecovery();assert.equal(proof.guiIndependent,true);assert.equal(proof.partial,true);assert.equal(proof.recovered,true);assert.equal(proof.cleaned,true);
});
test('owned transient service restarts after SIGKILL and cleans GUI/client/unit/fixture',async()=>{
 const proof=await transientLifecycle();for(const key of ['guiIndependent','restart','retained','clientsClosed','guiReaped','unitStopped','fixtureRemoved'])assert.equal(proof[key],true,key);
});
test('deliberately failing GUI remains a failure with complete transient cleanup',async()=>{
 await assert.rejects(transientLifecycle({gui:'/usr/bin/false'}),e=>e instanceof Error&&e.message==='READINESS_EXIT_1'&&'cleanup' in e&&Object.values(e.cleanup as object).every(Boolean));
});
test('production entry starts without CLI or credentials and unsafe/corrupt storage fails truthfully',async()=>{
 const {fixture,connect,reap,removed,root,launchGui}=await import('./gui-lifecycle.js');const {join}=await import('node:path');const {mkdir,writeFile,symlink,readFile}=await import('node:fs/promises');
 for(const mode of ['missing','config','storage']){
  const f=await fixture();let daemon:ReturnType<typeof spawn>|undefined,window:ReturnType<typeof spawn>|undefined;let c:Awaited<ReturnType<typeof connect>>|undefined;
  try{
   const configDir=join(f.home,'.config/tilde');const stateDir=join(f.home,'.local/state/tilde');await mkdir(configDir,{recursive:true,mode:0o700});await mkdir(stateDir,{recursive:true,mode:0o700});
   if(mode==='config')await writeFile(join(configDir,'config.toml'),'[invalid',{mode:0o600});
   if(mode==='storage'){await writeFile(join(f.home,'retained'),'unchanged',{mode:0o600});await symlink(join(f.home,'retained'),join(stateDir,'pi.sqlite'));}
   daemon=spawn(process.execPath,[join(root,'apps/daemon/dist/main.js')],{env:{...privateEnvironment(f.home),HOME:f.home,XDG_CONFIG_HOME:join(f.home,'.config'),XDG_STATE_HOME:join(f.home,'.local/state'),XDG_RUNTIME_DIR:join(f.home,'run'),PATH:'/no-cli-available'},stdio:['ignore','pipe','pipe']});
   if(mode==='missing'){await readiness(daemon);c=await connect(f.socket);const hello=await c.request('system.hello',{});assert.equal((hello.result as {credential:{credentialStored:boolean}}).credential.credentialStored,false);const denied=await c.request('conversation.submit',{requestId:'no-cli',text:'hi',selectionRevision:(hello.result as {settings:{selectionRevision:string}}).settings.selectionRevision});assert.equal((denied.error as {code:string}).code,'AUTH_REQUIRED');}
   else{await assert.rejects(readiness(daemon),/READINESS_EXIT_1/);if(mode==='storage')assert.equal(await readFile(join(f.home,'retained'),'utf8'),'unchanged');}
   window=launchGui(f.home,f.socket);await readiness(window,'window_ready');
  }finally{c?.close();await reap(window);await reap(daemon);assert.equal(await removed(f.home),true);}
 }
});
test('live smoke refuses to run without explicit opt-in',async()=>{
 const {command,root}=await import('./gui-lifecycle.js');const {join}=await import('node:path');
 await assert.rejects(command(process.execPath,[join(root,'scripts/live-smoke.mjs')],{env:{PATH:'/usr/bin:/bin',HOME:'/unusable-without-opt-in',XDG_RUNTIME_DIR:''}}),e=>typeof e==='object'&&e!==null&&'code' in e&&e.code===2);
});
test('fixtureRestartDoesNotRewriteAnExistingLockedCredentialStore',async t=>{const {fixture,launchDaemon,reap,removed,connect}=await import('./gui-lifecycle.js'),{resolvePaths}=await import('@tilde/config'),{openCredentialStore}=await import('@tilde/credentials'),{readFile}=await import('node:fs/promises');const f=await fixture();let daemon:ReturnType<typeof launchDaemon>|undefined,c:Awaited<ReturnType<typeof connect>>|undefined,release=()=>{},locked:Promise<unknown>|undefined;t.after(async()=>{release();await locked?.catch(()=>{});c?.close();await reap(daemon);await removed(f.home);});try{daemon=launchDaemon(f.home);await readiness(daemon);await reap(daemon,'SIGKILL');const paths=resolvePaths({XDG_RUNTIME_DIR:f.home+'/run'},f.home,process.geteuid!()),store=openCredentialStore(paths.defaultAuthFile);await store.modify('opencode-go',async current=>({...current,type:'api_key',key:'explicitly-replaced-fixture-key',opaque:{keep:true}}));const before=await readFile(paths.defaultAuthFile);let entered!:()=>void;const held=new Promise<void>(r=>{entered=r;}),wait=new Promise<void>(r=>{release=r;});locked=store.modify('opencode-go',async()=>{entered();await wait;return undefined;});await held;daemon=launchDaemon(f.home);await readiness(daemon);c=await connect(f.socket);const hello=await c.wire('settings.get');assert.equal(hello.result.credential.status,'store_busy');release();await locked;locked=undefined;assert.deepEqual(await readFile(paths.defaultAuthFile),before);}finally{release();await locked;c?.close();await reap(daemon);assert.equal(await removed(f.home),true);}});
