import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,mkdir,writeFile,readFile,rename,symlink,link,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{createHash}from'node:crypto';
import{createSanitizer}from'./redact.js';import{openRoot}from'./paths.js';
// Break caught: overlap flushing, UTF8 decoding or truncation can release credential bytes before persistence.
test('split secret is absent before every sink',()=>{
 const key='synthetic-秘密-'+ 'x'.repeat(40),s=createSanitizer([key]);const bytes=Buffer.from('prefix '+key+' suffix');
 for(let cut=0;cut<=bytes.length;cut++){
  const st=s.stream();const out=st.push(bytes.subarray(0,cut))+st.push(bytes.subarray(cut))+st.finish(false);assert.equal(out,'prefix [REDACTED] suffix');
 }
 for(let cut=1;cut<Buffer.byteLength(key);cut++){const st=s.stream();const out=st.push(Buffer.from('prefix '+key).subarray(0,7+cut))+st.finish(true);assert.equal(out,'prefix [TRUNCATED]');}
 assert.equal(s.text('Authorization: Bearer abcdefghijklmnopqrstuvwxyz'),'Authorization: Bearer [REDACTED]');
 const malformed=s.stream();assert.throws(()=>malformed.push(Uint8Array.of(255)),/ENCODING/);
 assert.throws(()=>createSanitizer(['x'.repeat(4097)]),/SECRET_UNSUPPORTED/);
});
test('protected path cannot be reached through alias',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tilde-paths-'));t.after(()=>rm(dir,{recursive:true,force:true}));const work=join(dir,'work'),priv=join(dir,'private');await mkdir(work,{mode:0o700});await mkdir(priv,{mode:0o700});await writeFile(join(priv,'auth'),'synthetic',{mode:0o600});
 await assert.rejects(openRoot(priv,[priv]));const root=await openRoot(work,[priv]);t.after(()=>root.close());
 await symlink(priv,join(work,'alias'));assert.throws(()=>root.read('alias/auth',100));assert.throws(()=>root.read('../private/auth',100));assert.throws(()=>root.read('/etc/passwd',100));await symlink('/proc/self/fd',join(work,'magic'));assert.throws(()=>root.read('magic/0',100));
 await link(join(priv,'auth'),join(work,'hard'));assert.throws(()=>root.read('hard',100));
 await symlink(work,join(dir,'root-alias'));await assert.rejects(openRoot(join(dir,'root-alias'),[]));
});
test('pinned parent rejects deterministic ancestor swap and absent target collision',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tilde-swap-'));t.after(()=>rm(dir,{recursive:true,force:true}));await mkdir(join(dir,'parent'),{mode:0o700});await mkdir(join(dir,'outside'),{mode:0o700});const root=await openRoot(dir,[]);t.after(()=>root.close());
 const stage=root.stage('parent/new',Buffer.from('safe'),null);await rename(join(dir,'parent'),join(dir,'old'));await symlink(join(dir,'outside'),join(dir,'parent'));assert.throws(()=>root.commit(stage));await assert.rejects(readFile(join(dir,'outside/new')));
 const other=root.stage('new',Buffer.from('ours'),null);await writeFile(join(dir,'new'),'theirs');assert.throws(()=>root.commit(other));assert.equal(await readFile(join(dir,'new'),'utf8'),'theirs');
});
test('descriptor stage validates expected identity and commits private bytes',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tilde-stage-'));t.after(()=>rm(dir,{recursive:true,force:true}));const root=await openRoot(dir,[]);t.after(()=>root.close());
 const next=root.commit(root.stage('a',Buffer.from('first'),null));assert.equal(next.sha256,createHash('sha256').update('first').digest('hex'));assert.equal(next.mode&0o777,0o600);
 const stage=root.stage('a',Buffer.from('second'),next);await writeFile(join(dir,'a'),'external');assert.throws(()=>root.commit(stage));assert.equal(await readFile(join(dir,'a'),'utf8'),'external');
});
test('staged temporary identity cannot be substituted and close cleans owned stages',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tilde-stage-swap-'));t.after(()=>rm(dir,{recursive:true,force:true}));const root=await openRoot(dir,[]);t.after(()=>root.close());const stage=root.stage('target',Buffer.from('ours'),null);await writeFile(join(dir,stage.token),'tampered');assert.throws(()=>root.commit(stage));await assert.rejects(readFile(join(dir,'target')));root.close();await assert.rejects(readFile(join(dir,stage.token)));
});
test('ordinary text streams promptly while potential credential prefixes stay private',()=>{const s=createSanitizer(['synthetic-stream-key']);const stream=s.stream();assert.equal(stream.push(Buffer.from('ordinary words ')),'ordinary words ');assert.equal(stream.push(Buffer.from('synthetic-str')),'');assert.equal(stream.push(Buffer.from('eam-key ')),'[REDACTED] ');assert.equal(stream.finish(false),'');const header=s.stream();const outputs=[header.push(Buffer.from('Authorization: Bea')),header.push(Buffer.from('rer token-value')),header.push(Buffer.from('\n'))].join('')+header.finish(false);assert.equal(outputs,'Authorization: Bearer [REDACTED]\n');});
test('complete overlapping known-secret spans cannot be cut by prefix holdback',()=>{for(const keys of [['fixture-key-fixture'],['fixture-key-one-e','e-fixture-key-two']]){const secret=keys[0]!,s=createSanitizer(keys);for(let split=0;split<=Buffer.byteLength(secret);split++){const bytes=Buffer.from(secret),stream=s.stream();const emitted=[stream.push(bytes.subarray(0,split)),stream.push(bytes.subarray(split)),stream.push(Buffer.from('X ')),stream.finish(false)];assert.equal(emitted.join(''),'[REDACTED]X ');assert.ok(emitted.every(chunk=>!chunk.includes(secret.slice(0,10))));}const truncated=s.stream();assert.equal(truncated.push(Buffer.from(secret))+truncated.finish(true),'[TRUNCATED]');}});
