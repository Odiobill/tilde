import{join,relative,isAbsolute,dirname,basename}from'node:path';
import{type ToolConfig,ensurePrivateDirectory,readPrivateFile,writePrivateAtomic}from'@tilde/config';
import{validateToolRequest,validateM3ToolRequest,type AdmittedLimits,type ToolRequest}from'@tilde/protocol';
import{containsSecret,sanitizeBounded,type Sanitizer}from'./redact.js';import{openRoot,sha256,type FileState,type RootHandle,type StagedWrite}from'./paths.js';
import{ToolError,type AdapterRegistry,type GuardedToolRequest,type Json,type PreparedOperation,type Receipt,type OperationRecord,type Reconciliation}from'./types.js';import{artifactFiles}from'./artifacts.js';import{digest,canonical}from'./broker.js';
export interface ReceiptStorage{read(name:string,maxBytes?:number):Promise<Json|undefined>;write(name:string,value:Json,maxBytes?:number):Promise<void>}
export function privateReceiptStorage(stateDir:string):ReceiptStorage{
 const dir=join(stateDir,'operations');const path=(name:string)=>{if(!/^(fs|backup)-[a-f0-9]{64}\.json$/.test(name))throw new ToolError('INVALID_RECEIPT');return join(dir,name);};
 return{async read(name,maxBytes=262144){const raw=await readPrivateFile(path(name),maxBytes);return raw===undefined?undefined:JSON.parse(raw) as Json;},async write(name,value,maxBytes){await ensurePrivateDirectory(stateDir,process.geteuid!());await ensurePrivateDirectory(dir,process.geteuid!());const raw=JSON.stringify(value);if(maxBytes!==undefined&&Buffer.byteLength(raw)>maxBytes)throw new ToolError('CONTENT_TOO_LARGE');await writePrivateAtomic(path(name),raw,undefined,maxBytes===undefined?{}:{maxExistingBytes:maxBytes});}};
}
type Target={root:string;path:string};
type FilePlan={target:Target;destination?:Target;prior:FileState|null;newHash?:string};
type FsReceipt={id:string;fingerprint:string;requestDigest:string;phase:'prepared'|'observed';tool:ToolRequest['tool'];plan:FilePlan;stage?:{token:string;state:FileState};state?:FileState};
const json=(v:unknown)=>v as Json;
const failure=(code:string):Receipt=>({result:{isError:true,text:code,code,truncated:false,stopRun:true},observed:null});
const knownCode=(e:unknown)=>e instanceof ToolError?e.code:typeof(e as {code?:unknown})?.code==='string'&&/^[A-Z_]+$/.test((e as {code:string}).code)?(e as {code:string}).code:'FILESYSTEM_FAILED';
export function createFilesystemAdapters(config:ToolConfig,sanitizer:Sanitizer,options:{stateDir:string;protectedPaths:readonly string[];storage?:ReceiptStorage}):AdapterRegistry{
 const storage=options.storage??privateReceiptStorage(options.stateDir),roots=new Map<string,Promise<RootHandle>>();
 async function root(path:string,policy?:AdmittedLimits){const cap=policy?.source==='m3'?Math.max(policy.settings.fileReadBytes,policy.settings.fileWriteBytes):65536;const key=JSON.stringify([path,cap]);let r=roots.get(key);if(!r){r=openRoot(path,[options.stateDir,...options.protectedPaths],cap);roots.set(key,r);}return r;}
 function target(path:string):Target{if(!path.startsWith('/')||path.includes('\0')||path.split('/').slice(1).some(p=>!p||p==='.'||p==='..'))throw new ToolError('UNSAFE_PATH');for(const r of [...config.roots].sort((a,b)=>b.length-a.length)){const rel=relative(r,path);if(rel&&!rel.startsWith('../')&&rel!=='..'&&!isAbsolute(rel))return{root:r,path:rel};}throw new ToolError('OUTSIDE_ROOT');}
 async function stat(t:Target,policy?:AdmittedLimits){return(await root(t.root,policy)).stat(t.path);}
 async function parentExists(t:Target,policy?:AdmittedLimits){const parent=dirname(t.path);if(parent!=='.'&&(await(await root(t.root,policy)).stat(parent))?.kind!=='directory')throw new ToolError('MISSING_PARENT');}
 function checkedPrior(state:FileState|null,expected:string|null,maxBytes=65536){if(expected===null){if(state)throw new ToolError('PRECONDITION_CHANGED');return;}if(!state||state.kind!=='file'||state.size>maxBytes||state.sha256!==expected)throw new ToolError('PRECONDITION_CHANGED');}
 function newContent(request:GuardedToolRequest,old:string,maxBytes=65536):string{
  if(request.tool==='fs_write'){if(Buffer.byteLength(request.args.content)>maxBytes)throw new ToolError('CONTENT_TOO_LARGE');return request.args.content;}
  if(request.tool==='fs_patch'){const{search,replacement}=request.args;const at=old.indexOf(search);if(at<0||old.indexOf(search,at+1)>=0)throw new ToolError('PATCH_MATCH_COUNT');const value=old.slice(0,at)+replacement+old.slice(at+search.length);if(Buffer.byteLength(value)>maxBytes)throw new ToolError('CONTENT_TOO_LARGE');return value;}
  throw new ToolError('INVALID_TOOL');
 }
 function decode(bytes:Uint8Array):string{try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ToolError('ENCODING_UNSUPPORTED');}}
 function highRisk(path:string,state:FileState|null,request:GuardedToolRequest){return !!(state&&state.mode&0o111)||['.bashrc','.bash_profile','.bash_login','.bash_logout','.profile','.zshrc','.zshenv','.zprofile','.zlogin','.zlogout','.kshrc','.mkshrc','.xprofile','.xinitrc','config.fish'].includes(basename(path))||/\/(?:conf\.d|functions|completions)\/[^/]+\.fish$/.test('/'+path)||/\/(?:systemd|autostart)\//.test('/'+path)||(request.tool==='fs_write'&&state!==null&&request.args.content==='')||(request.tool==='fs_patch'&&state!==null&&request.args.replacement==='');}
 const adapter={
  async prepare(request:GuardedToolRequest,policy?:AdmittedLimits):Promise<PreparedOperation>{
   const maxWrite=policy?.source==='m3'?policy.settings.fileWriteBytes:65536,maxRead=policy?.source==='m3'?policy.settings.fileReadBytes:65536;
   try{if(!(policy?.source==='m3'?validateM3ToolRequest(request):validateToolRequest(request))||!request.tool.startsWith('fs_')||containsSecret(sanitizer,request))throw new ToolError('INVALID_TOOL_ARGUMENT');const path=request.tool==='fs_move'?request.args.from:'path'in request.args?request.args.path:undefined;if(!path)throw new ToolError('INVALID_TOOL');const t=target(path);await parentExists(t,policy);const prior=await stat(t,policy);const plan:FilePlan={target:t,prior};
    if(request.tool==='fs_read'){if(request.args.maxBytes!==undefined&&request.args.maxBytes>maxRead)throw new ToolError('CONTENT_TOO_LARGE');if(!prior||prior.kind!=='file')throw new ToolError('NOT_REGULAR');}
    else if(request.tool==='fs_mkdir'){if(prior)throw new ToolError('DESTINATION_EXISTS');}
    else if(request.tool==='fs_move'){checkedPrior(prior,request.args.expectedSha256,maxWrite);plan.destination=target(request.args.to);await parentExists(plan.destination,policy);if(await stat(plan.destination,policy))throw new ToolError('DESTINATION_EXISTS');}
    else if(request.tool==='fs_write'||request.tool==='fs_patch'){checkedPrior(prior,request.args.expectedSha256,maxWrite);const bytes=prior?(await(await root(t.root,policy)).read(t.path,maxWrite)).bytes:Buffer.alloc(0);const old=decode(bytes);if((policy?.source==='m3'?sanitizeBounded(sanitizer,old,8388608):sanitizer.text(old))!==old)throw new ToolError('SENSITIVE_BACKUP_DENIED');plan.newHash=sha256(newContent(request,old,maxWrite));}
    else throw new ToolError('INVALID_TOOL');
    const requestDigest=digest(request);return{request,...(policy?{policy:structuredClone(policy)}:{}),requestDigest,fingerprint:digest([requestDigest,plan]),preconditions:json(plan),policyRevision:'',summary:request.tool+' '+path,targets:[path,...(request.tool==='fs_move'?[request.args.to]:[])],highRisk:request.tool!=='fs_read'&&highRisk(path,prior,request)||request.tool==='fs_move'&&highRisk(request.args.to,prior,request),diagnostic:request.tool==='fs_read'};
   }catch(e){throw new ToolError(knownCode(e));}
  },
  async dispatch(prepared:PreparedOperation,id:string,signal?:AbortSignal):Promise<Receipt>{
   const policy=prepared.policy;const maxWrite=policy?.source==='m3'?policy.settings.fileWriteBytes:65536,maxRead=policy?.source==='m3'?policy.settings.fileReadBytes:65536,artifactLimit=policy?.source==='m3'?67108864:undefined;const request=prepared.request,plan=prepared.preconditions as unknown as FilePlan;let possibleEffect=false;let staged:{root:RootHandle;stage:StagedWrite}|undefined;
   try{if(signal?.aborted)return failure('CANCELLED');const r=await root(plan.target.root,policy);
    if(request.tool==='fs_read'){const read=r.read(plan.target.path,request.args.maxBytes??maxRead);return{result:{isError:false,text:policy?.source==='m3'?sanitizeBounded(sanitizer,decode(read.bytes),8388608):sanitizer.text(decode(read.bytes)),truncated:read.bytes.length<read.state.size},observed:json({state:read.state})};}
    const actual=r.stat(plan.target.path);if((actual?.identity??null)!==(plan.prior?.identity??null))return failure('PRECONDITION_CHANGED');
    const receipt:FsReceipt={id,fingerprint:prepared.fingerprint,requestDigest:prepared.requestDigest,phase:'prepared',tool:request.tool,plan};
    let observed:FileState;
    if(request.tool==='fs_write'||request.tool==='fs_patch'){
     const bytes=plan.prior?r.read(plan.target.path,maxWrite).bytes:Buffer.alloc(0);if(plan.prior){const old=decode(bytes);if((policy?.source==='m3'?sanitizeBounded(sanitizer,old,8388608):sanitizer.text(old))!==old)return failure('SENSITIVE_BACKUP_DENIED');await storage.write('backup-'+id+'.json',json({id,fingerprint:prepared.fingerprint,requestDigest:prepared.requestDigest,state:plan.prior,content:Buffer.from(bytes).toString('base64')}),artifactLimit);const backup=await storage.read('backup-'+id+'.json',artifactLimit) as {state:FileState;content:string}|undefined;if(!backup||sha256(Buffer.from(backup.content,'base64'))!==plan.prior.sha256||backup.state.identity!==plan.prior.identity)return failure('BACKUP_FAILED');}
     const content=Buffer.from(newContent(request,decode(bytes),maxWrite));if(sha256(content)!==plan.newHash)return failure('PRECONDITION_CHANGED');const stage=r.stage(plan.target.path,content,plan.prior);staged={root:r,stage};receipt.stage={token:stage.token,state:stage.state};await storage.write('fs-'+id+'.json',json(receipt),artifactLimit);if(signal?.aborted)return failure('CANCELLED');possibleEffect=true;observed=r.commit(stage);
    }else if(request.tool==='fs_move'){
     const d=plan.destination!;const dest=await root(d.root,policy);if(dest.stat(d.path))return failure('DESTINATION_EXISTS');await storage.write('fs-'+id+'.json',json(receipt),artifactLimit);possibleEffect=true;observed=r.move(plan.target.path,dest,d.path,plan.prior!);
    }else if(request.tool==='fs_mkdir'){
     await storage.write('fs-'+id+'.json',json(receipt),artifactLimit);possibleEffect=true;observed=r.mkdir(plan.target.path);
    }else return failure('INVALID_TOOL');
    receipt.phase='observed';receipt.state=observed;await storage.write('fs-'+id+'.json',json(receipt),artifactLimit);return{result:{isError:false,text:request.tool+' completed',truncated:false},observed:json({state:observed})};
   }catch(e){const code=knownCode(e);if(!possibleEffect||['PRECONDITION_CHANGED','DESTINATION_EXISTS','CROSS_DEVICE_DENIED'].includes(code))return failure(code);throw new ToolError('FILESYSTEM_OUTCOME_UNKNOWN');}finally{if(staged)staged.root.discard(staged.stage);}
  },
  async reconcile(record:OperationRecord):Promise<Reconciliation>{
   if(record.tool==='fs_read')return{kind:'failed',receipt:failure('READ_INTERRUPTED')};
   try{const receipt=await storage.read('fs-'+record.id+'.json',record.policy?.source==='m3'?67108864:undefined) as unknown as FsReceipt|undefined;if(!receipt||receipt.id!==record.id||receipt.fingerprint!==record.fingerprint||receipt.requestDigest!==record.requestDigest)return{kind:'unknown'};
    const plan=receipt.plan,current=await stat(plan.destination??plan.target,record.policy);let proven=false;
    if(record.tool==='fs_write'||record.tool==='fs_patch'){const expected=receipt.state??receipt.stage?.state;proven=!!(current&&expected&&current.dev===expected.dev&&current.ino===expected.ino&&current.sha256===plan.newHash&&current.mode===expected.mode&&current.uid===expected.uid&&current.gid===expected.gid);}
    else if(record.tool==='fs_move'){proven=!!(current&&plan.prior&&current.dev===plan.prior.dev&&current.ino===plan.prior.ino&&current.sha256===plan.prior.sha256&&current.mode===plan.prior.mode&&current.uid===plan.prior.uid&&current.gid===plan.prior.gid&&!(await stat(plan.target,record.policy)));}
    else if(record.tool==='fs_mkdir'){proven=!!(receipt.phase==='observed'&&current?.kind==='directory'&&receipt.state&&current.identity===receipt.state.identity);}
    if(!proven)return{kind:'unknown'};const result:Receipt={result:{isError:false,text:record.tool+' reconciled',truncated:false},observed:json({state:current})};return{kind:'completed',receipt:result};
   }catch{return{kind:'unknown'};}
  },
  async artifacts(record:OperationRecord,prune:boolean){return artifactFiles(options.stateDir,record,['fs-'+record.id+'.json','backup-'+record.id+'.json'],prune);},
  async close(){for(const r of roots.values())try{(await r).close();}catch{}roots.clear();}
 };
 return{fs_read:adapter,fs_write:adapter,fs_patch:adapter,fs_move:adapter,fs_mkdir:adapter};
}
