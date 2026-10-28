import lockfile from 'proper-lockfile';
import fs from 'node:fs';
import { lstat,readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalJson} from '@tilde/config';
import { setTimeout as delay } from 'node:timers/promises';
import type { CredentialStore,Credential,CredentialInfo,AuthOperationOptions } from '@earendil-works/pi-ai';
import type { CredentialStatus } from '@tilde/protocol';
import { absolute,ensurePrivateDirectory,inspectDirectory } from '@tilde/config/paths';
import { readPrivateFile,writePrivateAtomic } from '@tilde/config/files';
import { CredentialError } from './errors.js';
export type PrivateCredentialSnapshot={providerId:string;credential?:Credential;errorCode?:string;fingerprint:string};
export interface PrivateCredentialStore extends CredentialStore{snapshot(ids:readonly string[],op?:AuthOperationOptions):Promise<PrivateCredentialSnapshot[]>}
export type StoreOptions={finishMutation?:boolean;onCommitStart?:()=>void;beforeRead?:(id:string,current:unknown)=>Promise<void>;afterMutation?:(id:string,next:unknown)=>Promise<void>;beforeMutation?:(id:string,current:unknown)=>Promise<void>;scope?:'shared'|'separate';timeoutMs?:number;atomicWrite?:(path:string,text:string,check:()=>Promise<void>)=>Promise<void>};
const scopes=new WeakMap<CredentialStore,'shared'|'separate'>();
function provider(id:string):void{if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id)||['constructor','prototype','__proto__'].includes(id))throw new CredentialError('INVALID_PROVIDER');}
function cancelled(signal?:AbortSignal):void{if(signal?.aborted)throw new CredentialError('CANCELLED');}
function safeError(error:unknown):CredentialError{
 if(error instanceof CredentialError)return error;
 const code=(error as {code?:string})?.code;
 return new CredentialError(code==='UNSAFE_FILE'||code==='UNSAFE_DIRECTORY'||code==='FILE_UNREADABLE'?'UNSAFE_CREDENTIAL_FILE':code==='FILE_TOO_LARGE'?'CREDENTIAL_FILE_TOO_LARGE':'CREDENTIAL_STORE_FAILED');
}
export function openCredentialStore(authFile:string,options:StoreOptions={}):PrivateCredentialStore{
 // Construction never performs I/O; setup IPC can survive store failures.
 async function raw():Promise<Record<string,unknown>>{
  const text=await readPrivateFile(authFile,8388608);if(text===undefined)return {};
  try{const value:unknown=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value as Record<string,unknown>;}catch{throw new CredentialError('INVALID_CREDENTIAL_JSON');}
 }
 async function inspectLock():Promise<Awaited<ReturnType<typeof lstat>>|undefined>{
  try{const stat=await lstat(authFile+'.lock');if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.geteuid!()||(stat.mode&0o022)||(await readdir(authFile+'.lock')).length)throw new CredentialError('UNSAFE_LOCK');return stat;}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}
 }
 async function locked<T>(write:boolean,operation:(data:Record<string,unknown>,check:()=>Promise<void>,startCommit:()=>void)=>Promise<T>,op:AuthOperationOptions={}):Promise<T>{
  let release:(()=>Promise<void>)|undefined;let compromised=false;let held:Awaited<ReturnType<typeof lstat>>|undefined;let ownMtime:number|undefined;let committing=false;let heartbeatRevision=0,heartbeat:Promise<void>|undefined;
  const guardedFs={...fs,utimes:(path:fs.PathLike,atime:fs.TimeLike,mtime:fs.TimeLike,callback:fs.NoParamCallback)=>{
   if(String(path)!==authFile+'.lock'){fs.utimes(path,atime,mtime,callback);return;}
   heartbeatRevision++;let done!:()=>void;const pending=new Promise<void>(r=>{done=r;});heartbeat=pending;
   const finish=(error:NodeJS.ErrnoException|null)=>{heartbeatRevision++;if(heartbeat===pending)heartbeat=undefined;done();callback(error);};
   void(async()=>{
    if(held){const current=await inspectLock();if(!current||current.ino!==held.ino||current.dev!==held.dev||Number(current.mtimeMs)!==ownMtime)throw new CredentialError('LOCK_COMPROMISED');}
    await new Promise<void>((resolve,reject)=>fs.utimes(path,atime,mtime,error=>error?reject(error):resolve()));
    const current=await inspectLock();if(!current||held&&(current.ino!==held.ino||current.dev!==held.dev))throw new CredentialError('LOCK_COMPROMISED');
    const expected=mtime instanceof Date?mtime.getTime():Number(mtime)*1000;
    if(held&&(!Number.isFinite(expected)||Math.abs(Number(current.mtimeMs)-expected)>0.001))throw new CredentialError('LOCK_COMPROMISED');
    // The kernel may quantize Date milliseconds by a fraction of a microsecond.
    ownMtime=Number(current.mtimeMs);
   })().then(()=>finish(null),error=>{compromised=true;finish(error as NodeJS.ErrnoException);});
  },rmdir:(path:fs.PathLike,callback:fs.NoParamCallback)=>{
   if(!held){fs.rmdir(path,callback);return;}
   lstat(String(path)).then(s=>{if(s.ino!==held!.ino||s.dev!==held!.dev||!s.isDirectory()||s.isSymbolicLink()){callback(Object.assign(new Error('LOCK_COMPROMISED'),{code:'ECOMPROMISED'}));return;}fs.rmdir(path,callback);},callback);
  }};
  try{
   cancelled(op.signal);absolute(authFile);await inspectDirectory(dirname(authFile),process.geteuid!());
   // Safety/size check before lock acquisition; reread again under lock for correctness.
   await readPrivateFile(authFile,8388608);
   if(write){try{const parent=await lstat(dirname(authFile));if(!parent.isDirectory()||parent.uid!==process.geteuid!()||(parent.mode&0o022))throw new CredentialError('UNSAFE_CREDENTIAL_FILE');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await ensurePrivateDirectory(dirname(authFile),process.geteuid!());}}
   else try{await lstat(dirname(authFile));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return await operation({},async()=>{cancelled(op.signal);},()=>{});throw e;}
   const deadline=Date.now()+Math.min(options.timeoutMs??30000,30000);
   for(;;){
    cancelled(op.signal);await inspectLock();
    try{release=await lockfile.lock(authFile,{realpath:false,stale:30000,update:5000,retries:0,fs:guardedFs,onCompromised:()=>{compromised=true;}});break;}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ELOCKED')throw e;if(Date.now()>=deadline)throw new CredentialError('CREDENTIAL_LOCKED');
     try{await delay(Math.min(25,Math.max(1,deadline-Date.now())),undefined,{signal:op.signal});}catch{throw new CredentialError('CANCELLED');}
    }
   }
   held=await inspectLock();ownMtime=held?Number(held.mtimeMs):undefined;
   const check=async()=>{for(;;){if(!committing)cancelled(op.signal);if(heartbeat)await heartbeat;const revision=heartbeatRevision,current=await inspectLock();if(compromised||!held||!current||current.ino!==held.ino||current.dev!==held.dev)throw new CredentialError('LOCK_COMPROMISED');if(heartbeat||revision!==heartbeatRevision)continue;if(Number(current.mtimeMs)!==ownMtime)throw new CredentialError('LOCK_COMPROMISED');if(!committing)cancelled(op.signal);return;}};
   await check();return await operation(await raw(),check,()=>{options.onCommitStart?.();if(options.finishMutation)committing=true;});
  }catch(e){throw safeError(e);}
  finally{if(release)await release().catch(()=>{compromised=true;});}
 }
 function entry(data:Record<string,unknown>,id:string):Credential|undefined{
  if(!Object.hasOwn(data,id))return undefined;
  const v=data[id];if(!v||typeof v!=='object'||Array.isArray(v)||!['api_key','oauth'].includes(String((v as {type?:unknown}).type)))throw new CredentialError('UNSUPPORTED_CREDENTIAL');
  return structuredClone(v) as Credential;
 }
 async function commit(data:Record<string,unknown>,check:()=>Promise<void>):Promise<void>{
  try{await (options.atomicWrite??((path,text,check)=>writePrivateAtomic(path,text,check,{privateDirectory:false})))(authFile,JSON.stringify(data,null,2)+'\n',check);}
  catch(e){if(e instanceof CredentialError)throw e;throw new CredentialError('CREDENTIAL_WRITE_FAILED');}
 }
 const store:PrivateCredentialStore={
  async snapshot(ids,op){for(const id of ids)provider(id);return locked(false,async data=>ids.map(id=>{const raw=data[id];const fingerprint=createHash('sha256').update(canonicalJson(raw??null)).digest('hex');try{return {providerId:id,credential:entry(data,id),fingerprint};}catch(e){return {providerId:id,errorCode:safeError(e).code,fingerprint};}}),op);},
  async read(id,op){provider(id);return locked(false,async data=>{const current=entry(data,id);await options.beforeRead?.(id,current);return current;},op);},
  async list(op){return locked(false,async data=>Object.entries(data).flatMap(([providerId,v]):CredentialInfo[]=>v&&typeof v==='object'&&['api_key','oauth'].includes(String((v as {type?:unknown}).type))?[{providerId,type:(v as Credential).type}]:[]),op);},
  async modify(id,fn,op){provider(id);return locked(true,async(data,check,startCommit)=>{const current=entry(data,id);await options.beforeMutation?.(id,current);const next=await fn(current);if(next!==undefined){startCommit();await check();await options.beforeMutation?.(id,current);data[id]=next;await commit(data,check);await options.afterMutation?.(id,JSON.parse(JSON.stringify(next)));}else await check();return next??current;},op);},
  async delete(id,op){provider(id);await locked(true,async(data,check,startCommit)=>{await options.beforeMutation?.(id,data[id]);if(Object.hasOwn(data,id)){startCommit();await check();await options.beforeMutation?.(id,data[id]);delete data[id];await commit(data,check);await options.afterMutation?.(id,undefined);}},op);}
 };
 scopes.set(store,options.scope??'shared');return store;
}
export async function saveApiKey(store:CredentialStore,providerId:string,key:string):Promise<void>{
 if(!key.length||Buffer.byteLength(key)>4096||/[\x00-\x1f\x7f]/.test(key))throw new CredentialError('INVALID_CREDENTIAL');
 await store.modify(providerId,async()=>({type:'api_key',key}));
}
export async function credentialStatus(store:CredentialStore,providerId:string):Promise<CredentialStatus>{
 const records=await store.list();return {providerId,credentialStored:records.some(record=>record.providerId===providerId),store:scopes.get(store)??'shared'};
}
