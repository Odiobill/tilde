import{createHash}from'node:crypto';import{resolve}from'node:path';import{pathsOverlap}from'@tilde/config';import{native,type NativeStage}from'./native.js';
export type FileState={kind:'file'|'directory';dev:string;ino:string;mode:number;uid:number;gid:number;size:number;sha256?:string;identity:string};
export type StagedWrite={readonly token:string;readonly state:FileState};
export interface RootHandle {stat(relative:string):FileState|null;read(relative:string,maxBytes:number):{bytes:Uint8Array;state:FileState};stage(relative:string,bytes:Uint8Array,expected:FileState|null):StagedWrite;commit(stage:StagedWrite):FileState;discard(stage:StagedWrite):void;move(from:string,destination:RootHandle,to:string,expected:FileState):FileState;mkdir(relative:string):FileState;close():void}
const roots=new WeakMap<RootHandle,object>(),stages=new WeakMap<StagedWrite,{native:NativeStage;root:RootHandle;path:string;sha256:string}>();
export const sha256=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function enriched(r:{bytes:Buffer;state:FileState}){if(r.state.kind==='file'&&r.bytes.length===r.state.size)r.state.sha256=sha256(r.bytes);return r;}
export async function openRoot(path:string,protectedPaths:readonly string[],maxBytes=65536):Promise<RootHandle>{
 if(!path.startsWith('/')||path.includes('\0')||Buffer.byteLength(path)>4096||protectedPaths.some(p=>pathsOverlap(resolve(path),resolve(p))))throw new Error('PROTECTED_ROOT');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>8388608)throw new Error('INVALID_LIMIT');
 const handle=native.open(resolve(path),maxBytes),pendingStages=new Set<StagedWrite>();const root:RootHandle={
  stat(p){return enrichedOrNull(native.read(handle,p,maxBytes));},
  read(p,max){if(!Number.isInteger(max)||max<1||max>maxBytes)throw new Error('INVALID_LIMIT');const r=native.read(handle,p,max);if(!r||r.state.kind!=='file')throw new Error('NOT_REGULAR');return enriched(r);},
  stage(p,bytes,expected){if(bytes.length>maxBytes||expected&&(expected.kind!=='file'||expected.size>maxBytes||!expected.sha256))throw new Error('UNSUPPORTED_TARGET');const n=native.stage(handle,p,Buffer.from(bytes),expected?.identity??'');const stage={token:n.token,state:{...n.state,sha256:sha256(bytes)}};stages.set(stage,{native:n,root,path:p,sha256:sha256(bytes)});pendingStages.add(stage);return stage;},
  commit(stage){const s=stages.get(stage);if(!s||s.root!==root)throw new Error('INVALID_STAGE');const result={...native.commit(s.native.handle),sha256:s.sha256};pendingStages.delete(stage);return result;},
  discard(stage){const s=stages.get(stage);if(!s||s.root!==root)throw new Error('INVALID_STAGE');native.discard(s.native.handle);pendingStages.delete(stage);},
  move(from,destination,to,expected){const d=roots.get(destination);if(!d||expected.kind!=='file'||expected.size>maxBytes||!expected.sha256)throw new Error('INVALID_TARGET');return {...native.move(handle,from,d,to,expected.identity),sha256:expected.sha256};},
  mkdir(p){return native.mkdir(handle,p);},close(){for(const stage of pendingStages)root.discard(stage);native.close(handle);}
 };roots.set(root,handle);return root;
}
function enrichedOrNull(r:{bytes:Buffer;state:FileState}|null):FileState|null{return r?enriched(r).state:null;}
