import{readFileSync}from'node:fs';
import{withCredentialCrashBarrier}from'./credential-crash.js';
import type { ChildProcess } from 'node:child_process';
import { fixture,launchGui,launchDaemon,reap,connect,until,removed } from './gui-lifecycle.js';
import { readiness } from './lifecycle.js';
import type { Client } from './client.js';
type View={state:string;rows:{id:string;role:string;text:string;stopReason?:string}[];partial?:{text:string}};
export async function sourceRecovery():Promise<{guiIndependent:boolean;partial:boolean;recovered:boolean;cleaned:boolean}>{
 const f=await fixture();let daemon:ChildProcess|undefined,window:ChildProcess|undefined,c:Client|undefined;const proof={guiIndependent:false,partial:false,recovered:false,cleaned:false,guiDiagnostics:[] as {bytes:number;text:string}[]};
 try{
  daemon=launchDaemon(f.home);await readiness(daemon);c=await connect(f.socket);const hello=await c.request('system.hello',{});const revision=(hello.result as {settings:{selectionRevision:string}}).settings.selectionRevision;
  window=launchGui(f.home,f.socket);await readiness(window,'window_ready').catch(e=>{throw new Error('GUI_WINDOW_READY '+JSON.stringify({error:e.message,pid:window?.pid,stderr:(window as any).fixtureDiagnostics?.(),wait:window?.pid?readFileSync('/proc/'+window.pid+'/wchan','utf8'):''}));});proof.guiDiagnostics.push({bytes:(window as any).fixtureStderrBytes?.()??0,text:(window as any).fixtureDiagnostics?.()??''});await c.request('conversation.subscribe',{});await c.request('conversation.submit',{requestId:'first',text:'source fixture',selectionRevision:revision});
  await until(async()=>c!.frames.some(frame=>'view' in frame&&frame.view.chat.partial?.text),Boolean);proof.partial=true;
  await reap(window);proof.guiIndependent=daemon.exitCode===null&&daemon.signalCode===null;
  const first=await until(async()=>((await c!.request('conversation.get',{})).result as {chat:View}).chat as View,v=>v.state==='idle');
  window=launchGui(f.home,f.socket);await readiness(window,'window_ready').catch(e=>{throw new Error('GUI_WINDOW_READY '+JSON.stringify({error:e.message,pid:window?.pid,stderr:(window as any).fixtureDiagnostics?.(),wait:window?.pid?readFileSync('/proc/'+window.pid+'/wchan','utf8'):''}));});proof.guiDiagnostics.push({bytes:(window as any).fixtureStderrBytes?.()??0,text:(window as any).fixtureDiagnostics?.()??''});await c.request('conversation.submit',{requestId:'crash',text:'retain after crash',selectionRevision:revision});
  const before=await until(async()=>((await c!.request('conversation.get',{})).result as {chat:View}).chat as View,v=>!!v.partial?.text&&v.rows.filter(e=>e.role==='user').length===2);
  const user=before.rows.filter(e=>e.role==='user').at(-1)!.id;c.close();c=undefined;await withCredentialCrashBarrier(f.home,async()=>{await reap(daemon,'SIGKILL');});
  daemon=launchDaemon(f.home);await readiness(daemon);c=await connect(f.socket);
  let lastRecovery:View|undefined;
  const final=await until(async()=>{lastRecovery=((await c!.request('conversation.get',{})).result as {chat:View}).chat as View;return lastRecovery;},v=>v.state==='idle').catch(error=>{throw new Error('RECOVERY_OBSERVATION '+JSON.stringify({error:error.message,state:lastRecovery?.state,errorCode:(lastRecovery as unknown as {errorCode?:string})?.errorCode,rows:lastRecovery?.rows.map(r=>({id:r.id,role:r.role,stopReason:r.stopReason})),partial:!!lastRecovery?.partial}));});
  const duplicate=await c.request('conversation.submit',{requestId:'crash',text:'changed but same key',selectionRevision:'stale'});
  proof.recovered=first.rows.every(e=>final.rows.some(x=>x.id===e.id))&&final.rows.some(e=>e.id===user)&&final.rows.filter(e=>e.role==='user').length===2&&final.rows.filter(e=>e.role==='assistant'&&e.stopReason==='stop').length===2&&final.rows.filter(e=>e.role==='assistant'&&e.stopReason==='aborted').length===1&&new Set(final.rows.map(e=>e.id)).size===final.rows.length&&(duplicate.result as {deduplicated:boolean}).deduplicated;
 }finally{c?.close();const a=await reap(window);const b=await reap(daemon);proof.cleaned=a&&b&&await removed(f.home);}
 return proof;
}
