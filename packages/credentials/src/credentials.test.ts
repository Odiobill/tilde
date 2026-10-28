import { test,type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,lstat,rm,symlink,chmod,utimes,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { fork } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { openCredentialStore,saveApiKey,credentialStatus,resolveKey } from './index.js';
const secret='m1-synthetic-canary-do-not-emit';
async function fixture(t:TestContext){const home=await mkdtemp(join(tmpdir(),'tilde-credentials-'));t.after(()=>rm(home,{recursive:true,force:true}));return {home,file:join(home,'.pi/agent/auth.json')};}
const code=(expected:string)=>(e:unknown)=>e instanceof Error&&'code' in e&&e.code===expected;
test('missing store reads without creation, save creates private store and literal round trip without CLI',async t=>{
 const {home,file}=await fixture(t);const store=openCredentialStore(file);
 assert.equal(await store.read('opencode-go'),undefined);assert.deepEqual(await store.list(),[]);
 await assert.rejects(lstat(join(home,'.pi')),{code:'ENOENT'});
 await saveApiKey(store,'opencode-go',secret);assert.equal((await lstat(file)).mode&0o777,0o600);assert.equal((await lstat(dirname(file))).mode&0o777,0o700);
 assert.ok((await store.read('opencode-go'))?.type==='api_key');assert.ok(JSON.stringify(await store.read('opencode-go')).includes(secret));
 assert.ok(!JSON.stringify(await store.list()).includes(secret));assert.ok(!JSON.stringify(await credentialStatus(store,'opencode-go')).includes(secret));
});
test('separate selection preserves shared bytes and unknown provider/OAuth fields on modification/delete',async t=>{
 const {home,file}=await fixture(t);await mkdir(dirname(file),{recursive:true,mode:0o700});
 const original={other:{type:'oauth',refresh:'private-fixture',access:'private-fixture',expires:0,unknown:{future:true}},future:{type:'new-type',opaque:[1,2,3]}};
 const raw=JSON.stringify(original);await writeFile(file,raw,{mode:0o600});
 const separate=join(home,'separate.json');const s=openCredentialStore(separate,{scope:'separate'});await saveApiKey(s,'opencode-go',secret);
 assert.ok(await readFile(file,'utf8')===raw);assert.equal((await credentialStatus(s,'opencode-go')).store,'separate');
 const shared=openCredentialStore(file);await saveApiKey(shared,'opencode-go',secret);await shared.delete('opencode-go');
 assert.ok(JSON.stringify(JSON.parse(await readFile(file,'utf8')))===raw);
});
test('explicit named env templates and escapes resolve; ambient provider key never fills absent credentials',async t=>{
 const {file}=await fixture(t);assert.equal(await openCredentialStore(file).read('opencode-go'),undefined);
 assert.ok(resolveKey({type:'api_key',key:'$ONE/${TWO}/$$/$!',env:{ONE:'local'}},{ONE:'ambient',TWO:'two'})==='local/two/$/!');
 assert.ok(resolveKey({type:'api_key',key:'${bad-name}/$'}, {})==='${bad-name}/$');
 assert.throws(()=>resolveKey({type:'api_key',key:'$MISSING'},{}),code('AUTH_REQUIRED'));
 assert.throws(()=>resolveKey({type:'api_key'},{}),code('AUTH_REQUIRED'));
});
test('command-backed key never executes and metadata enumeration never resolves it',async t=>{
 const {home,file}=await fixture(t);await mkdir(dirname(file),{recursive:true,mode:0o700});
 const marker=join(home,'effect');await writeFile(file,JSON.stringify({'opencode-go':{type:'api_key',key:`!touch ${marker}`}}),{mode:0o600});
 const store=openCredentialStore(file);assert.equal((await credentialStatus(store,'opencode-go')).credentialStored,true);
 assert.equal((await store.list()).length,1);assert.throws(()=>resolveKey({type:'api_key',key:`!touch ${marker}`}),code('UNSUPPORTED_CREDENTIAL'));
 await assert.rejects(lstat(marker),{code:'ENOENT'});
});
test('invalid JSON, unsafe mode/symlink/foreign owner and oversized stores fail without changing original',async t=>{
 const {file,home}=await fixture(t);await mkdir(dirname(file),{recursive:true,mode:0o700});
 for(const raw of ['{broken','[]','null','x'.repeat(8388609)]){await writeFile(file,raw,{mode:0o600});await assert.rejects(saveApiKey(openCredentialStore(file),'opencode-go',secret));assert.ok(await readFile(file,'utf8')===raw);}
 await writeFile(file,'{}');await chmod(file,0o644);await assert.rejects(saveApiKey(openCredentialStore(file),'opencode-go',secret));assert.ok(await readFile(file,'utf8')==='{}');
 await rm(file);const target=join(home,'target');await writeFile(target,'{}',{mode:0o600});await symlink(target,file);await assert.rejects(openCredentialStore(file).read('opencode-go'));assert.ok(await readFile(target,'utf8')==='{}');
});
test('live lock contention and cancellation are typed failures, malformed locks are never stolen',async t=>{
 const {file}=await fixture(t);await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,'{}',{mode:0o600});
 const release=await lockfile.lock(file,{realpath:false,stale:30000,update:5000});
 try{
  await assert.rejects(openCredentialStore(file,{timeoutMs:40}).read('opencode-go'),code('CREDENTIAL_LOCKED'));
  const controller=new AbortController();const read=openCredentialStore(file).read('opencode-go',{signal:controller.signal});setTimeout(()=>controller.abort(),20);await assert.rejects(read,code('CANCELLED'));
 }finally{await release();}
 await writeFile(file+'.lock','malformed',{mode:0o600});await assert.rejects(saveApiKey(openCredentialStore(file),'opencode-go',secret),code('UNSAFE_LOCK'));assert.ok(await readFile(file+'.lock','utf8')==='malformed');
});
test('cooperating separate CLI protocol writer and Tilde mutation both survive the lock barrier',async t=>{
 const {file}=await fixture(t);await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,'{}',{mode:0o600});
 const child=fork(new URL('./fixtures/cli-writer.js',import.meta.url),[file],{stdio:['ignore','ignore','ignore','ipc']});
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
 await new Promise<void>((resolve,reject)=>{child.once('message',()=>resolve());child.once('error',reject);child.once('exit',c=>{if(c!==0)reject(new Error('CLI_FIXTURE_FAILED'));});});
 const save=saveApiKey(openCredentialStore(file),'opencode-go',secret);child.send('release');
 await save;await new Promise<void>((resolve,reject)=>{if(child.exitCode!==null){child.exitCode===0?resolve():reject(new Error('CLI_FIXTURE_FAILED'));return;}child.once('exit',c=>c===0?resolve():reject(new Error('CLI_FIXTURE_FAILED')));});
 const final=JSON.parse(await readFile(file,'utf8'));assert.ok(final.cli?.unknown==='preserve');assert.ok(final['opencode-go']?.key===secret);
});
test('compromised lock and atomic write/fsync failure retain original bytes and do not leak errors',async t=>{
 const {file}=await fixture(t);await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,'{}',{mode:0o600});
 const broken=openCredentialStore(file,{atomicWrite:async()=>{throw new Error(secret);}});
 await assert.rejects(saveApiKey(broken,'opencode-go',secret),code('CREDENTIAL_WRITE_FAILED'));assert.ok(await readFile(file,'utf8')==='{}');
 const compromised=openCredentialStore(file);
 await assert.rejects(compromised.modify('opencode-go',async()=>{await rm(file+'.lock',{recursive:true});await mkdir(file+'.lock');return {type:'api_key',key:secret};}),code('LOCK_COMPROMISED'));assert.ok(await readFile(file,'utf8')==='{}');assert.equal((await lstat(file+'.lock')).isDirectory(),true);
});
test('existing owned searchable parent is not chmodded; foreign file is rejected before locking',async t=>{
 const {home}=await fixture(t);const dir=join(home,'existing');await mkdir(dir,{mode:0o755});const file=join(dir,'auth.json');
 await saveApiKey(openCredentialStore(file),'opencode-go',secret);assert.equal((await lstat(dir)).mode&0o777,0o755);
 await assert.rejects(openCredentialStore('/etc/passwd').read('opencode-go'),code('UNSAFE_CREDENTIAL_FILE'));
});
test('same-inode lock mtime tampering is rejected and substituted lock survives release',async t=>{
 const {file}=await fixture(t);await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,'{}',{mode:0o600});
 await assert.rejects(openCredentialStore(file).modify('opencode-go',async()=>{const old=new Date(1000);await utimes(file+'.lock',old,old);return {type:'api_key',key:secret};}),code('LOCK_COMPROMISED'));
 assert.ok(await readFile(file,'utf8')==='{}');
});
test('actual injected rename and file sync failures leave old bytes and remove temporary files',async t=>{
 const {file}=await fixture(t);await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,'{}',{mode:0o600});
 const {writePrivateAtomic}=await import('@tilde/config/files');
 for(const operation of ['rename','sync'] as const){
  const store=openCredentialStore(file,{atomicWrite:(path,text,check)=>writePrivateAtomic(path,text,check,{[operation]:async()=>{throw new Error(secret);}})});
  await assert.rejects(saveApiKey(store,'opencode-go',secret),code('CREDENTIAL_WRITE_FAILED'));
  assert.ok(await readFile(file,'utf8')==='{}');assert.deepEqual(await readdir(dirname(file)),['auth.json']);
 }
});
