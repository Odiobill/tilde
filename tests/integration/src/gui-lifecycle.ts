import{privateEnvironment}from'./private-environment.js';
import { spawn,type ChildProcess,execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,mkdir,rm,lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from './client.js';
export const root=fileURLToPath(new URL('../../..',import.meta.url));
export const gui=join(root,'.build/cmake/apps/gui/tilde-gui');
export const driver=join(root,'apps/daemon/dist/fixtures/daemon-child.js');
export const command=promisify(execFile);
export async function fixture(){const home=await mkdtemp(join(tmpdir(),'tilde-m1-integration-'));await mkdir(join(home,'run'),{mode:0o700});return {home,socket:join(home,'run/tilde/agent.sock')};}
export function launchGui(home:string,socket:string,executable=gui){const child=spawn(executable,['--socket',socket,'--outbox',join(home,'gui-outbox.json'),'--activation',join(home,'activation.sock')],{env:{...privateEnvironment(home),QT_QPA_PLATFORM:'offscreen',QT_QUICK_BACKEND:'software'},stdio:['ignore','pipe','pipe']});let diagnostic='',stderrBytes=0;child.stderr.on('data',(b:Buffer)=>{stderrBytes+=b.length;diagnostic=(diagnostic+b.toString()).slice(-4096);});return Object.assign(child,{fixtureDiagnostics:()=>diagnostic,fixtureStderrBytes:()=>stderrBytes});}
export function launchDaemon(home:string){return spawn(process.execPath,[driver,'--fixture',home],{env:privateEnvironment(home),stdio:['ignore','pipe','pipe']});}
export async function reap(child?:ChildProcess,signal:NodeJS.Signals='SIGTERM'):Promise<boolean>{
 if(!child)return true;if(child.exitCode!==null||child.signalCode!==null)return true;
 const ended=once(child,'exit');child.kill(signal);let timer:NodeJS.Timeout|undefined;
 const timely=await Promise.race([ended.then(()=>true),new Promise<false>(r=>{timer=setTimeout(()=>r(false),3000);})]);clearTimeout(timer);
 if(!timely){child.kill('SIGKILL');await ended;}return child.exitCode!==null||child.signalCode!==null;
}
export async function connect(socket:string,timeout=5000):Promise<Client>{
 const until=Date.now()+timeout;
 while(Date.now()<until){const c=new Client(socket);try{await c.ready();return c;}catch{c.close();await delay(50);}}
 throw new Error('DAEMON_NOT_READY');
}
export async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,timeout=6000):Promise<T>{
 let last:T|undefined;const end=Date.now()+timeout;while(Date.now()<end){last=await read();if(accept(last))return last;await delay(20);}
 const observed=last&&typeof last==='object'?last as Record<string,unknown>:undefined;
 throw Object.assign(new Error('OBSERVATION_TIMEOUT'),{lastObservation:observed?{state:observed.state,errorCode:observed.errorCode,rowCount:Array.isArray(observed.rows)?observed.rows.length:undefined}:typeof last});
}
export async function removed(home:string){await rm(home,{recursive:true,force:true});return lstat(home).then(()=>false,()=>true);}
