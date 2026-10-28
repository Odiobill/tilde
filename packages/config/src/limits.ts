import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {parse,stringify} from 'smol-toml';
import {ConfigError,inspectDirectory,type RuntimePaths} from './paths.js';
import {readPrivateFile,writePrivateAtomic} from './files.js';
export type WorkLimits={version:1;providerRequests:number|null;toolOperations:number|null;providerTimeoutMs:number;outputTokens:number;modelOutputOverrides:{providerId:string;modelId:string;outputTokens:number}[];shellTimeoutMs:number|null;inputBytes:number;fileReadBytes:number;fileWriteBytes:number;retainedOutputBytes:number;modelOutputBytes:number;retentionDays:number|null;retentionBytes:number|null};
export type PublicLimits={settings:WorkLimits;revision:string;effectiveModel?:{providerId:string;modelId:string;outputTokens:number};retentionSource:'legacy'|'configured'|'default'};
const defaults:WorkLimits={version:1,providerRequests:64,toolOperations:256,providerTimeoutMs:180000,outputTokens:8192,modelOutputOverrides:[],shellTimeoutMs:3600000,inputBytes:65536,fileReadBytes:1048576,fileWriteBytes:1048576,retainedOutputBytes:1048576,modelOutputBytes:65536,retentionDays:30,retentionBytes:536870912};
const nullable=new Set(['providerRequests','toolOperations','shellTimeoutMs','retentionDays','retentionBytes']);
const bounded:Record<string,number>={inputBytes:131072,fileReadBytes:8388608,fileWriteBytes:8388608,retainedOutputBytes:8388608,modelOutputBytes:8388608};
const positive=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=max;
function identifier(v:unknown,max:number):v is string{return typeof v==='string'&&v.length>0&&Buffer.byteLength(v)<=max&&!/[\x00-\x1f\x7f]/.test(v);}
export function checkWorkLimits(value:unknown):WorkLimits{
 const invalid=()=>{throw new ConfigError('LIMITS_INVALID');};
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const v=value as Record<string,unknown>;if(Object.keys(v).sort().join(',')!==Object.keys(defaults).sort().join(',')||v.version!==1)return invalid();
 for(const key of Object.keys(defaults)){if(key==='version'||key==='modelOutputOverrides')continue;const item=v[key];if(item===null&&nullable.has(key))continue;if(!positive(item,bounded[key]))return invalid();}
 if(!Array.isArray(v.modelOutputOverrides)||v.modelOutputOverrides.length>256)return invalid();
 const seen=new Set<string>();const overrides:WorkLimits['modelOutputOverrides']=[];
 for(const item of v.modelOutputOverrides){if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!=='modelId,outputTokens,providerId'||!identifier(item.providerId,128)||!identifier(item.modelId,256)||!positive(item.outputTokens))return invalid();const key=JSON.stringify([item.providerId,item.modelId]);if(seen.has(key))return invalid();seen.add(key);overrides.push({providerId:item.providerId,modelId:item.modelId,outputTokens:item.outputTokens});}
 // Own every returned value; caller mutations cannot change an accepted snapshot.
 return {...Object.fromEntries(Object.keys(defaults).map(k=>[k,v[k]])),modelOutputOverrides:overrides.sort((a,b)=>JSON.stringify([a.providerId,a.modelId]).localeCompare(JSON.stringify([b.providerId,b.modelId])))} as WorkLimits;
}
export function resolveOutputTokens(settings:WorkLimits,model:{providerId:string;modelId:string;maxTokens?:number}):number{
 settings=checkWorkLimits(settings);
 if(!identifier(model.providerId,128)||!identifier(model.modelId,256)||(model.maxTokens!==undefined&&!positive(model.maxTokens)))throw new ConfigError('LIMITS_INVALID');
 const override=settings.modelOutputOverrides.find(v=>v.providerId===model.providerId&&v.modelId===model.modelId);
 const legacy=model.providerId==='opencode-go'&&model.modelId==='deepseek-v4.1-flash'?8192:2048;
 const max=model.maxTokens??legacy;
 if(override){if(override.outputTokens>max)throw new ConfigError('LIMITS_INVALID');return override.outputTokens;}
 if(settings.outputTokens!==8192&&settings.outputTokens>max)throw new ConfigError('LIMITS_INVALID');
 return Math.min(settings.outputTokens,max);
}
// The daemon is the sole writer. Serialize all of its callers; also reread at
// atomic replacement to detect a changed private file during preparation.
const lanes=new Map<string,Promise<unknown>>();
export async function serializeSettingsWrite<T>(path:string,fn:()=>Promise<T>):Promise<T>{
 const key=resolve(path),previous=lanes.get(key)??Promise.resolve();const job=previous.catch(()=>{}).then(fn);lanes.set(key,job);
 try{return await job;}finally{if(lanes.get(key)===job)lanes.delete(key);}
}
export function settingsRevision(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
async function readState(paths:RuntimePaths):Promise<{public:PublicLimits;raw:string|undefined;legacyRaw:string|undefined}>{
 try{
  const dir=dirname(paths.configFile);await inspectDirectory(dir,process.geteuid!(),true);
  const raw=await readPrivateFile(join(dir,'limits.toml'),262144);const parsed=raw===undefined?{version:1}:parse(raw) as Record<string,unknown>;
  if(parsed.version!==1||Object.keys(parsed).some(k=>!Object.hasOwn(defaults,k)))throw 0;
  const decoded:Record<string,unknown>={...defaults,modelOutputOverrides:[]};
  for(const [k,v] of Object.entries(parsed)){if(v===(k==='shellTimeoutMs'?'none':'unlimited')&&nullable.has(k))decoded[k]=null;else if(typeof v==='string')throw 0;else decoded[k]=v;}
  let retentionSource:PublicLimits['retentionSource']=Object.hasOwn(parsed,'retentionDays')?'configured':'default';let legacyRaw:string|undefined;
  if(!Object.hasOwn(parsed,'retentionDays')){
   legacyRaw=await readPrivateFile(join(dir,'tools.toml'),65536);
   if(legacyRaw!==undefined){const legacy=parse(legacyRaw) as Record<string,unknown>;if(legacy.version!==1||!positive(legacy.retentionDays,365)||!Array.isArray(legacy.roots)||Object.keys(legacy).sort().join(',')!=='retentionDays,roots,version')throw 0;decoded.retentionDays=legacy.retentionDays;retentionSource='legacy';}
  }
  const settings=checkWorkLimits(decoded);return {public:{settings,revision:settingsRevision([settings,retentionSource]),retentionSource},raw,legacyRaw};
 }catch{throw new ConfigError('LIMITS_INVALID');}
}
export async function loadWorkLimits(paths:RuntimePaths):Promise<PublicLimits>{return (await readState(paths)).public;}
export async function updateWorkLimits(paths:RuntimePaths,expectedRevision:string,next:WorkLimits,validate?:(settings:WorkLimits)=>void|Promise<void>):Promise<PublicLimits>{
 const checked=checkWorkLimits(next),file=join(dirname(paths.configFile),'limits.toml');
 return serializeSettingsWrite(file,async()=>{
  const current=await readState(paths);if(current.public.revision!==expectedRevision)throw new ConfigError('LIMITS_CHANGED');await validate?.(checked);
  const encoded=Object.fromEntries(Object.entries(checked).map(([k,v])=>[k,v===null?(k==='shellTimeoutMs'?'none':'unlimited'):v]));
  if(current.public.retentionSource==='legacy'&&checked.retentionDays===current.public.settings.retentionDays)delete encoded.retentionDays;
  await writePrivateAtomic(file,stringify(encoded),async()=>{const latest=await readState(paths);if(latest.raw!==current.raw||latest.legacyRaw!==current.legacyRaw)throw new ConfigError('LIMITS_CHANGED');});
  return loadWorkLimits(paths);
 });
}
