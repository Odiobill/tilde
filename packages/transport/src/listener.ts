import { lstat,chmod,unlink,realpath } from 'node:fs/promises';
import { dirname } from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { inspectDirectory } from '@tilde/config/paths';
import { native,duplex } from './native.js';
import type { Duplex } from 'node:stream';
export type Peer={uid:number;pid:number;gid:number};
export type UnixListener={close():Promise<void>};
async function probe(path:string):Promise<boolean>{
 return new Promise((resolve,reject)=>{
  const socket=net.connect(path);const timer=setTimeout(()=>{socket.destroy();reject(new Error('SOCKET_UNRESPONSIVE'));},250);
  socket.once('connect',()=>{clearTimeout(timer);socket.destroy();resolve(true);});
  socket.once('error',(error:NodeJS.ErrnoException)=>{clearTimeout(timer);socket.destroy();if(error.code==='ECONNREFUSED')resolve(false);else reject(new Error('SOCKET_PROBE_FAILED'));});
 });
}
export async function listenUnix(path:string,onClient:(stream:Duplex,peer:Peer)=>void):Promise<UnixListener>{
 const uid=process.geteuid!();await inspectDirectory(dirname(path),uid,true);
 try{
  const old=await lstat(path);if(!old.isSocket()||old.uid!==uid||(old.mode&0o077))throw new Error('UNSAFE_SOCKET');
  if(await probe(path))throw new Error('SOCKET_IN_USE');
  const now=await lstat(path);if(now.ino!==old.ino||now.dev!==old.dev||now.uid!==uid)throw new Error('SOCKET_CHANGED');await unlink(path);
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const clients=new Set<Duplex>();
 const handle=native.listen(path,(accepted,uid,pid,gid)=>{
  const stream=duplex(accepted);clients.add(stream);stream.once('close',()=>clients.delete(stream));
  try{onClient(stream,{uid,pid,gid});}catch{stream.destroy();}
 });
 await chmod(path,0o600);const owned=await lstat(path);let closing:Promise<void>|undefined;
 return {close(){return closing??=(async()=>{
  for(const stream of clients)stream.destroy();handle.close();
  try{const current=await lstat(path);if(current.isSocket()&&current.ino===owned.ino&&current.dev===owned.dev&&current.uid===uid)await unlink(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 })();}};
}
export async function acquireDaemonOwner(stateDir:string):Promise<()=>Promise<void>>{
 await inspectDirectory(stateDir,process.geteuid!(),true);const canonical=await realpath(stateDir);
 const path='\0tilde-owner-'+createHash('sha256').update(canonical).digest('hex');
 const server=net.createServer(c=>c.destroy());
 await new Promise<void>((resolve,reject)=>{server.once('error',()=>reject(new Error('DAEMON_ALREADY_RUNNING')));server.listen(path,()=>resolve());});
 let closing:Promise<void>|undefined;return ()=>closing??=new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
}
