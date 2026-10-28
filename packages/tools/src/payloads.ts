import{createHash}from'node:crypto';import{constants}from'node:fs';import{open,lstat,unlink}from'node:fs/promises';import{join,dirname}from'node:path';
import{ensurePrivateDirectory,readPrivateFile,writePrivateAtomic}from'@tilde/config';
import type{Journal}from'./journal.js';import{containsSecret,sanitizeBounded,type Sanitizer}from'./redact.js';import{ToolError,type OperationRecord}from'./types.js';
import type{ApprovalManifest,PayloadManifest,PayloadChunk}from'@tilde/protocol';
export interface PayloadService{approvalManifest(cid:string,id:string,fingerprint:string):Promise<ApprovalManifest>;approvalChunk(cid:string,id:string,fingerprint:string,payloadId:string,offset:number):Promise<PayloadChunk>;manifest(cid:string,id:string,kind:'request'|'output'):Promise<PayloadManifest>;chunk(cid:string,payloadId:string,offset:number):Promise<PayloadChunk>;close():Promise<void>}
const maximum=67108864,chunkBytes=32768;
const sha=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
function canonical(v:unknown):string{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';}
export function payloadText(record:OperationRecord,kind:'request'|'output'):string|undefined{
 if(record.payloadPruned)return undefined;
 if(kind==='output')return record.receipt?.result.text;
 if(!record.prepared)return undefined;
 return canonical({operationId:record.id,fingerprint:record.fingerprint,request:record.prepared.request,risk:record.risk,expiresAt:record.approvalExpiresAt??0});
}
export function payloadFiles(id:string):string[]{if(!/^[a-f0-9]{64}$/.test(id))throw new ToolError('INVALID_OPERATION');return ['request','output'].map(kind=>'payload-'+id+'-'+kind+'.txt');}
const payloadId=(id:string,kind:'request'|'output',hash:string)=>(kind==='request'?'r':'o')+'.'+Buffer.from(id,'hex').toString('base64url')+'.'+Buffer.from(hash,'hex').toString('base64url');
function parseId(value:string):{id:string;kind:'request'|'output';hash:string}{const match=/^([ro])\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(value);if(!match)throw new ToolError('PAYLOAD_UNAVAILABLE');const id=Buffer.from(match[2]!,'base64url').toString('hex'),hash=Buffer.from(match[3]!,'base64url').toString('hex'),kind=match[1]==='r'?'request':'output';if(id.length!==64||hash.length!==64||payloadId(id,kind,hash)!==value)throw new ToolError('PAYLOAD_UNAVAILABLE');return{id,kind,hash};}
type Meta={manifest:PayloadManifest;path:string;identity:string;signature:string};
const identity=(s:{dev:number;ino:number;size:number;mtimeMs:number;ctimeMs:number})=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');
const signature=(r:OperationRecord,kind:string)=>canonical([r.fingerprint,r.payloadPruned??false,kind==='request'?!!r.prepared:!!r.receipt,kind==='output'?r.finishedAt??null:null,r.approvalExpiresAt??null]);
export function createPayloadService(options:{stateDir:string;journal:Journal;sanitizer:Sanitizer}):PayloadService{
 const{stateDir,journal,sanitizer}=options;let closed=false;const cache=new Map<string,Meta>(),lines=new Map<string,Promise<unknown>>(),active=new Set<Promise<unknown>>();
 function record(cid:string,id:string):OperationRecord{if(closed)throw new ToolError('CLOSED');const r=journal.get(id);if(!r||r.conversationId!==cid||r.payloadPruned)throw new ToolError('PAYLOAD_UNAVAILABLE');return r;}
 function approval(cid:string,id:string,fingerprint:string):OperationRecord{const r=record(cid,id);if(r.status!=='awaiting_approval'||r.fingerprint!==fingerprint||r.approvalExpiresAt===undefined||Date.now()>=r.approvalExpiresAt||Date.now()<r.lastObservedAt||!r.prepared)throw new ToolError('STALE_APPROVAL');return r;}
 function track<T>(fn:()=>Promise<T>):Promise<T>{if(closed)return Promise.reject(new ToolError('CLOSED'));const p=fn();active.add(p);void p.then(()=>active.delete(p),()=>active.delete(p));return p;}
 async function ensure(cid:string,id:string,kind:'request'|'output'):Promise<Meta>{
  const r=record(cid,id),key=JSON.stringify([cid,id,kind]),sig=signature(r,kind);const prior=cache.get(key);if(prior?.signature===sig){cache.delete(key);cache.set(key,prior);return prior;}
  const source=payloadText(r,kind);if(source===undefined)throw new ToolError('PAYLOAD_UNAVAILABLE');if(kind==='request'&&containsSecret(sanitizer,r.prepared!.request))throw new ToolError('SECRET_ARGUMENT');
  if(kind==='output'&&sanitizeBounded(sanitizer,source,8388608)!==source)throw new ToolError('PAYLOAD_UNAVAILABLE');const text=source,bytes=Buffer.byteLength(text);if(bytes>maximum)throw new ToolError('CONTENT_TOO_LARGE');const hash=sha(text),path=join(stateDir,'operations',payloadFiles(id)[kind==='request'?0:1]!);
  const previous=lines.get(path)??Promise.resolve();const write=previous.catch(()=>{}).then(async()=>{await ensurePrivateDirectory(dirname(path),process.geteuid!());const existing=await readPrivateFile(path,maximum);if(existing===undefined){journal.markArtifactsDirty(id);await writePrivateAtomic(path,text,undefined,{maxExistingBytes:maximum});}else if(sha(existing)!==hash)throw new ToolError('PAYLOAD_CHANGED');return lstat(path);});lines.set(path,write);let stat;try{stat=await write;}finally{if(lines.get(path)===write)lines.delete(path);}
  // A prune/expiry while the cache is prepared cannot resurrect retained bytes.
  let latest:OperationRecord;try{latest=record(cid,id);if(signature(latest,kind)!==sig)throw new ToolError('PAYLOAD_CHANGED');}catch(e){
   // A prune that overtook this cache write must not leave resurrected bytes.
   // Remove only the exact private inode just produced/verified by this writer.
   try{const current=await lstat(path);if(current.isFile()&&current.nlink===1&&current.uid===process.geteuid!()&&!(current.mode&0o077)&&current.dev===stat.dev&&current.ino===stat.ino)await unlink(path);}catch{}throw e;
  }
  const meta:Meta={manifest:{conversationId:cid,subjectId:id,payloadId:payloadId(id,kind,hash),kind,sha256:hash,bytes,chunkBytes},path,identity:identity(stat),signature:sig};cache.set(key,meta);while(cache.size>16)cache.delete(cache.keys().next().value!);return meta;
 }
 async function chunk(cid:string,id:string,offset:number):Promise<PayloadChunk>{
  const parsed=parseId(id),meta=await ensure(cid,parsed.id,parsed.kind);if(meta.manifest.payloadId!==id)throw new ToolError('PAYLOAD_CHANGED');
  if(!Number.isSafeInteger(offset)||offset<0||offset>meta.manifest.bytes)throw new ToolError('PAYLOAD_OFFSET');
  const file=await open(meta.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let text:string;
  try{const before=await file.stat();if(!before.isFile()||before.uid!==process.geteuid!()||(before.mode&0o077)||before.nlink!==1||identity(before)!==meta.identity)throw new ToolError('PAYLOAD_CHANGED');
   const buffer=Buffer.alloc(Math.min(chunkBytes,meta.manifest.bytes-offset));let length=0;while(length<buffer.length){const read=await file.read(buffer,length,buffer.length-length,offset+length);if(!read.bytesRead)break;length+=read.bytesRead;}
   if(length!==buffer.length)throw new ToolError('PAYLOAD_CHANGED');let decoded:string|undefined;for(let trim=0;trim<=3&&trim<=length;trim++){try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length-trim));break;}catch{}}if(decoded===undefined||length>0&&!decoded)throw new ToolError('PAYLOAD_OFFSET');text=decoded;
   if(identity(await file.stat())!==meta.identity)throw new ToolError('PAYLOAD_CHANGED');
  }finally{await file.close();}
  const latest=record(cid,parsed.id);if(signature(latest,parsed.kind)!==meta.signature)throw new ToolError('PAYLOAD_CHANGED');const next=offset+Buffer.byteLength(text);return{payloadId:id,offset,text,...(next<meta.manifest.bytes?{nextOffset:next}:{})};
 }
 return{
  approvalManifest(cid,id,fingerprint){return track(async()=>{const r=approval(cid,id,fingerprint),meta=await ensure(cid,id,'request');approval(cid,id,fingerprint);return{conversationId:cid,operationId:id,fingerprint,payloadId:meta.manifest.payloadId,sha256:meta.manifest.sha256,bytes:meta.manifest.bytes,chunkBytes,expiresAt:r.approvalExpiresAt!,risk:r.risk};});},
  approvalChunk(cid,id,fingerprint,payload,offset){return track(async()=>{approval(cid,id,fingerprint);const p=parseId(payload);if(p.id!==id||p.kind!=='request')throw new ToolError('PAYLOAD_UNAVAILABLE');const result=await chunk(cid,payload,offset);approval(cid,id,fingerprint);return result;});},
  manifest(cid,id,kind){return track(async()=>structuredClone((await ensure(cid,id,kind)).manifest));},
  chunk(cid,id,offset){return track(()=>chunk(cid,id,offset));},
  async close(){if(closed)return;closed=true;await Promise.allSettled([...active]);cache.clear();}
 };
}
