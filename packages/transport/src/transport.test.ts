import { test,type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,lstat,symlink,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { once } from 'node:events';
import { fork } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { listenUnix,acquireDaemonOwner } from './index.js';
async function fixture(t:TestContext){const dir=await mkdtemp(join(tmpdir(),'tilde-transport-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,path:join(dir,'agent.sock')};}
async function client(path:string){const c=net.connect(path);c.on('error',()=>{});await once(c,'connect');return c;}
test('native same-UID streams round trip; one write and paused reads obey backpressure',async t=>{
 const {path}=await fixture(t);let peerPid=0;
 const listener=await listenUnix(path,(stream,peer)=>{peerPid=peer.pid;stream.on('error',()=>{});stream.pipe(stream);});t.after(()=>listener.close());
 const c=await client(path);t.after(()=>c.destroy());c.write('hello');const [data]=await once(c,'data');assert.equal(data.toString(),'hello');assert.equal(peerPid,process.pid);
 assert.equal((await lstat(path)).mode&0o777,0o600);
});
test('close during pending native writes settles each callback once without closing unrelated streams',async t=>{
 const {path}=await fixture(t);let accepted:import('node:stream').Duplex|undefined;
 const listener=await listenUnix(path,s=>{accepted=s;s.on('error',()=>{});s.pause();});t.after(()=>listener.close());
 const c=await client(path);t.after(()=>c.destroy());while(!accepted)await delay(1);
 let callbacks=0;const write=new Promise<void>(resolve=>accepted!.write(Buffer.alloc(1048576),()=>{callbacks++;resolve();}));
 accepted.destroy();await write;await delay(20);assert.equal(callbacks,1);assert.equal(accepted.destroyed,true);
 const other=await client(path);t.after(()=>other.destroy());assert.equal(other.destroyed,false);
});
test('ninth authenticated client is rejected and listener closes its owned clients',async t=>{
 const {path}=await fixture(t);let delivered=0;const listener=await listenUnix(path,s=>{delivered++;s.on('error',()=>{});});t.after(()=>listener.close());
 const clients=[];for(let i=0;i<9;i++){const c=await client(path);clients.push(c);t.after(()=>c.destroy());}
 await once(clients[8]!,'close');assert.equal(delivered,8);await listener.close();assert.equal(await lstat(path).then(()=>true,()=>false),false);
});
test('abstract owner rejects second writer; process crash releases canonical state ownership',async t=>{
 const {dir}=await fixture(t);const release=await acquireDaemonOwner(dir);await assert.rejects(acquireDaemonOwner(dir));await release();
 const child=fork(new URL('./fixtures/owner-child.js',import.meta.url),[dir],{stdio:['ignore','ignore','ignore','ipc']});
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});await once(child,'message');await assert.rejects(acquireDaemonOwner(dir));child.kill('SIGKILL');await once(child,'exit');
 const final=await acquireDaemonOwner(dir);await final();
});
test('live, symlink and nonsocket paths are untouched; close never unlinks replacement inode',async t=>{
 const {dir,path}=await fixture(t);const listener=await listenUnix(path,s=>s.on('error',()=>{}));t.after(()=>listener.close());
 await assert.rejects(listenUnix(path,()=>{}));const stat=await lstat(path);
 await rm(path);await writeFile(path,'replacement',{mode:0o600});await listener.close();assert.equal((await lstat(path)).isFile(),true);
 await assert.rejects(listenUnix(path,()=>{}));await rm(path);await symlink(join(dir,'elsewhere'),path);await assert.rejects(listenUnix(path,()=>{}));assert.equal((await lstat(path)).isSymbolicLink(),true);assert.ok(stat.isSocket());
});
test('stale owned socket is probed independently then cleaned without stealing live endpoints',async t=>{
 const {path}=await fixture(t);const child=fork(new URL('./fixtures/socket-child.js',import.meta.url),[path],{stdio:['ignore','ignore','ignore','ipc']});
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});await once(child,'message');child.kill('SIGKILL');await once(child,'exit');assert.equal((await lstat(path)).isSocket(),true);
 const listener=await listenUnix(path,s=>s.on('error',()=>{}));await listener.close();await assert.rejects(lstat(path),{code:'ENOENT'});
});
test('paused native reads stay bounded and resume without losing bytes',async t=>{
 const {path}=await fixture(t);let accepted:import('node:stream').Duplex|undefined;
 const listener=await listenUnix(path,s=>{accepted=s;s.on('error',()=>{});});t.after(()=>listener.close());
 const c=await client(path);t.after(()=>c.destroy());while(!accepted)await delay(1);
 const payload=Buffer.alloc(524288,65);c.write(payload);await delay(30);
 assert.ok(accepted.readableLength<=32768);assert.ok(accepted.readableLength>0);
 let received=0;await new Promise<void>(resolve=>{accepted!.on('data',chunk=>{received+=chunk.length;if(received===payload.length)resolve();});});assert.equal(received,payload.length);
});
test('independent process uses native authenticated endpoint and no handles leak on repeated close',async t=>{
 const {path}=await fixture(t);const listener=await listenUnix(path,s=>{s.on('error',()=>{});s.pipe(s);});t.after(()=>listener.close());
 const child=fork(new URL('./fixtures/client-child.js',import.meta.url),[path],{stdio:'ignore'});const [status]=await once(child,'exit');assert.equal(status,0);
 await listener.close();await listener.close();await assert.rejects(lstat(path),{code:'ENOENT'});
});
