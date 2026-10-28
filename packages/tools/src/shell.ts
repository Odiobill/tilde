import{validateM3ToolRequest}from'@tilde/protocol';
import{join,dirname}from'node:path';import{readFile,lstat}from'node:fs/promises';import{userInfo}from'node:os';import{ensurePrivateDirectory,readPrivateFile,writePrivateAtomic,inspectDirectory}from'@tilde/config';import{ToolError}from'./types.js';import type{ToolRequest,ToolResult,M3ToolRequest}from'@tilde/protocol';
export type ExecutionIdentity={unitName:string;bootId:string;invocationId:string;cgroup:string;pid:number;startTicks:string;deadline:number|null};
export type ProcessPayloadV1={version:1;id:string;nonce:string;unitName:string;bootId:string;fingerprint:string;requestDigest:string;request:ToolRequest;stateDir:string;home:string;runtimeDir:string;deadline:number};
export type ProcessPayloadV2=Omit<ProcessPayloadV1,'version'|'request'|'deadline'>&{version:2;request:M3ToolRequest;deadline:number|null;resolvedDurationMs:number|null;policyRevision:string;retainedOutputBytes:number};
export type ProcessPayload=ProcessPayloadV1|ProcessPayloadV2;
export type ProcessReceipt={version:1|2;policyRevision?:string;resolvedDurationMs?:number|null;id:string;nonce:string;fingerprint:string;phase:'bootstrap'|'started'|'exited';identity:ExecutionIdentity;result?:ToolResult;exitCode?:number|null;signal?:string|null;timedOut?:boolean};
export function processFiles(stateDir:string,id:string){if(!/^[a-f0-9]{64}$/.test(id))throw new ToolError('INVALID_OPERATION');const dir=join(stateDir,'operations');return{dir,payload:join(dir,'process-'+id+'.payload.json'),receipt:join(dir,'process-'+id+'.receipt.json')};}
export async function writeProcessFile(path:string,value:ProcessPayload|ProcessReceipt):Promise<void>{await ensurePrivateDirectory(dirname(path),process.geteuid!());const raw=JSON.stringify(value),max=value.version===2?67108864:8388608;if(Buffer.byteLength(raw)>max)throw new ToolError('CONTENT_TOO_LARGE');await writePrivateAtomic(path,raw,undefined,{maxExistingBytes:max});}
export async function readProcessFile<T>(path:string,maxBytes=524288):Promise<T|undefined>{const raw=await readPrivateFile(path,maxBytes);return raw===undefined?undefined:JSON.parse(raw) as T;}
export const bootId=async()=>String(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim();
export async function processIdentity(pid:number):Promise<{bootId:string;pid:number;startTicks:string;cgroup:string}>{const stat=await readFile('/proc/'+pid+'/stat','utf8');const tail=stat.slice(stat.lastIndexOf(')')+2).split(' ');const cgroup=(await readFile('/proc/'+pid+'/cgroup','utf8')).split('\n').find(l=>l.startsWith('0::'))?.slice(3);if(!tail[19]||!cgroup?.startsWith('/')||cgroup.includes('..'))throw new ToolError('IDENTITY_UNAVAILABLE');return{bootId:await bootId(),pid,startTicks:tail[19],cgroup};}
export async function cgroupEmpty(path:string):Promise<boolean>{if(!path.startsWith('/')||path.includes('..'))return false;try{return(await readFile('/sys/fs/cgroup'+path+'/cgroup.procs','utf8')).trim()==='';}catch(e){return(e as NodeJS.ErrnoException).code==='ENOENT';}}
export function shellEnvironment(runtimeDir:string):NodeJS.ProcessEnv{return{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:userInfo().homedir,XDG_RUNTIME_DIR:runtimeDir};}
export async function cwdIdentity(path:string,roots:readonly string[]):Promise<string>{if(!path.startsWith('/')||path.includes('\0')||path.split('/').slice(1).some(p=>!p||p==='.'||p==='..')||!roots.some(r=>path===r||path.startsWith(r+'/')))throw new ToolError('OUTSIDE_ROOT');await inspectDirectory(path,process.geteuid!());const s=await lstat(path);if(!s.isDirectory()||s.uid!==process.geteuid!()||(s.mode&0o022))throw new ToolError('UNSAFE_CWD');return[s.dev,s.ino,s.mode,s.ctimeMs].join(':');}

export type DeadlinePorts={now():number;set(callback:()=>void,ms:number):unknown;clear(handle:unknown):void};
export function resolveProcessDeadline(duration:number|null,now:number):number|null{
 if(!Number.isSafeInteger(now)||now<0||duration!==null&&(!Number.isSafeInteger(duration)||duration<1||duration>Number.MAX_SAFE_INTEGER-now-5000))throw new ToolError('INVALID_DURATION');return duration===null?null:now+duration;
}
export function remainingProcessTime(payload:ProcessPayload,clocks:{wall:number;monotonic:number}):number|null{return payload.deadline===null?null:payload.deadline-(payload.version===1?clocks.wall:clocks.monotonic);}
export function startDeadline(deadline:number|null,onTimeout:()=>void,ports:DeadlinePorts):()=>void{
 if(deadline===null)return()=>{};let timer:unknown,closed=false;
 const check=()=>{if(closed)return;const remaining=deadline-ports.now();if(remaining<=0){closed=true;onTimeout();return;}timer=ports.set(check,Math.min(remaining,2147483647));};check();return()=>{closed=true;if(timer!==undefined)ports.clear(timer);};
}
export function validProcessPayload(payload:unknown):payload is ProcessPayload{
 if(!payload||typeof payload!=='object')return false;const p=payload as ProcessPayload;
 if(p.version===1)return typeof p.deadline==='number'&&Number.isFinite(p.deadline);
 if(p.version!==2||!validateM3ToolRequest(p.request)||!Number.isSafeInteger(p.retainedOutputBytes)||p.retainedOutputBytes<1||p.retainedOutputBytes>8388608||typeof p.policyRevision!=='string'||!p.policyRevision||Buffer.byteLength(p.policyRevision)>128)return false;
 if(p.request.tool!=='shell_run'&&p.request.tool!=='service_restart')return false;
 const duration=p.resolvedDurationMs;
 if(p.request.tool==='shell_run'&&p.request.args.timeoutMs!==duration||p.request.tool==='service_restart'&&duration!==30000)return false;
 if(duration===null)return p.deadline===null;
 return Number.isSafeInteger(duration)&&duration>0&&typeof p.deadline==='number'&&Number.isSafeInteger(p.deadline)&&p.deadline>=duration&&p.deadline<=Number.MAX_SAFE_INTEGER-5000;
}
