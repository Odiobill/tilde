import{privateEnvironment}from'./private-environment.js';
import{withCredentialCrashBarrier}from'./credential-crash.js';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { command,fixture,launchGui,reap,connect,until,removed,driver } from './gui-lifecycle.js';
import type { Client } from './client.js';
export function readiness(child:ChildProcess,event='ready',timeout=5000):Promise<Record<string,unknown>>{
 return new Promise((resolve,reject)=>{
  let pending='',bytes=0,done=false;
  const timer=setTimeout(()=>finish(new Error('READINESS_TIMEOUT')),timeout);
  const cleanup=()=>{clearTimeout(timer);child.stdout?.off('data',data);child.off('exit',exit);child.off('error',error);};
  const finish=(failure?:Error,value?:Record<string,unknown>)=>{if(done)return;done=true;cleanup();failure?reject(Object.assign(failure,{outputBytes:Math.min(bytes,4096)})):resolve(value!);};
  const exit=(code:number|null,signal:NodeJS.Signals|null)=>finish(new Error(signal?'READINESS_SIGNAL_'+signal:code===0?'READINESS_MISSING_OUTPUT':'READINESS_EXIT_'+code));
  const error=()=>finish(new Error('READINESS_SPAWN_FAILED'));
  const data=(chunk:Buffer)=>{
   bytes+=chunk.length;if(bytes>4096){finish(new Error('READINESS_OUTPUT_LIMIT'));return;}pending+=chunk.toString('utf8');
   for(;;){const end=pending.indexOf('\n');if(end<0)break;const line=pending.slice(0,end);pending=pending.slice(end+1);try{const parsed:unknown=JSON.parse(line);if(parsed&&typeof parsed==='object'&&'event' in parsed&&parsed.event===event){finish(undefined,parsed as Record<string,unknown>);return;}}catch{}}
  };
  child.stdout?.on('data',data);child.once('exit',exit);child.once('error',error);
  if(child.exitCode!==null||child.signalCode!==null)exit(child.exitCode,child.signalCode);
 });
}
export async function transientLifecycle(options:{gui?:string}={}):Promise<Record<string,boolean>>{
 const f=await fixture();const unit='tilde-m1-test-'+randomUUID()+'.service';let c:Client|undefined;let window:ChildProcess|undefined;let failure:unknown;
 const proof:Record<string,boolean>={guiIndependent:false,restart:false,retained:false,clientsClosed:false,guiReaped:false,unitStopped:false,fixtureRemoved:false};let started=false;
 async function systemctl(...args:string[]){return (await command('systemctl',['--user',...args],{timeout:5000,maxBuffer:4096})).stdout.trim();}
 try{
  await command('systemd-run',['--user','--quiet','--collect','--unit='+unit,'--property=Restart=on-failure','--property=RestartSec=1s','--property=StartLimitIntervalSec=30s','--property=StartLimitBurst=3','--property=TimeoutStopSec=10s','--property=KillMode=control-group','--property=UMask=0077','/usr/bin/env','-i',...Object.entries(privateEnvironment(f.home,false,true)).filter((p):p is [string,string]=>typeof p[1]==='string').map(([k,v])=>k+'='+v),process.execPath,driver,'--fixture',f.home],{timeout:5000,maxBuffer:4096});started=true;
  c=await connect(f.socket);const hello=await c.request('system.hello',{});const settings=(hello.result as {settings:{selectionRevision:string}}).settings;
  window=launchGui(f.home,f.socket,options.gui);await readiness(window,'window_ready');
  await c.request('conversation.subscribe',{});const receipt=await c.request('conversation.submit',{requestId:'service-run',text:'service fixture input',selectionRevision:settings.selectionRevision});if(!receipt.ok)throw new Error('ADMISSION_FAILED');
  await until(async()=>c!.frames.some(frame=>'view' in frame&&frame.view.chat.partial?.text),Boolean);
  await reap(window);proof.guiReaped=true;proof.guiIndependent=await systemctl('is-active',unit)==='active';
  const before=((await c.request('conversation.get',{})).result as {chat:{state:string;rows:{id:string;role:string;stopReason?:string}[]}}).chat as {rows:{id:string;role:string;stopReason?:string}[]};const user=before.rows.find(e=>e.role==='user')!.id;
  const oldPid=await systemctl('show',unit,'--property=MainPID','--value');await withCredentialCrashBarrier(f.home,()=>systemctl('kill','--signal=SIGKILL','--kill-whom=main',unit).then(()=>{}));c.close();c=undefined;
  const pid=await until(()=>systemctl('show',unit,'--property=MainPID','--value'),pid=>pid!=='0'&&pid!==oldPid,6000);proof.restart=pid!==oldPid;
  c=await connect(f.socket);const final=await until(async()=>((await c!.request('conversation.get',{})).result as {chat:{state:string;rows:{id:string;role:string;stopReason?:string}[]}}).chat as {state:string;rows:{id:string;role:string;stopReason?:string}[]},v=>v.state==='idle');
  proof.retained=final.rows.filter(e=>e.role==='user').length===1&&final.rows.some(e=>e.id===user)&&final.rows.filter(e=>e.role==='assistant'&&e.stopReason==='stop').length===1&&final.rows.filter(e=>e.role==='assistant'&&e.stopReason==='aborted').length===1;
  window=launchGui(f.home,f.socket);await readiness(window,'window_ready');
 }catch(error){failure=error;}
 finally{
  if(c){c.close();proof.clientsClosed=c.socket.destroyed;}else proof.clientsClosed=true;proof.guiReaped=await reap(window);
  if(started){try{await systemctl('stop',unit);}catch{}try{await systemctl('reset-failed',unit);}catch{}}
  try{const state=await systemctl('show',unit,'--property=LoadState','--value');const listed=await systemctl('list-units',unit,'--all','--plain','--no-legend','--no-pager');proof.unitStopped=state==='not-found'&&listed==='';}catch{proof.unitStopped=false;}
  proof.fixtureRemoved=await removed(f.home);
 }
 const cleanup={clientsClosed:proof.clientsClosed,guiReaped:proof.guiReaped,unitStopped:proof.unitStopped,fixtureRemoved:proof.fixtureRemoved};
 if(failure)throw Object.assign(failure instanceof Error?failure:new Error('LIFECYCLE_FAILED'),{cleanup});
 if(!Object.values(proof).every(Boolean))throw Object.assign(new Error('LIFECYCLE_PROOF_FAILED'),{cleanup});return proof;
}
