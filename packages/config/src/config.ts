import { parse, stringify } from 'smol-toml';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { type RuntimePaths, ConfigError } from './paths.js';
import { readPrivateFile, writePrivateAtomic } from './files.js';
export type AppConfig={version:1;providerId:'opencode-go';modelId:string;authFile:string};
export type PublicSettings=AppConfig & {selectionRevision:string;store:'shared'|'separate'};
function checked(value:unknown):AppConfig{
 if(typeof value!=='object'||value===null||Array.isArray(value))throw new ConfigError('INVALID_CONFIG');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='authFile,modelId,providerId,version'||v.version!==1||v.providerId!=='opencode-go'||typeof v.modelId!=='string'||!v.modelId.length||v.modelId.length>256||/[\x00-\x1f]/.test(v.modelId)||typeof v.authFile!=='string'||!isAbsolute(v.authFile)||v.authFile.includes('\0')||v.authFile.length>4096)throw new ConfigError('INVALID_CONFIG');
 return {version:1,providerId:'opencode-go',modelId:v.modelId,authFile:v.authFile};
}
export async function loadConfig(paths:RuntimePaths):Promise<AppConfig>{
 const raw=await readPrivateFile(paths.configFile,65536);
 if(raw===undefined)return {version:1,providerId:'opencode-go',modelId:'deepseek-v4.1-flash',authFile:paths.defaultAuthFile};
 try{return checked(parse(raw));}catch{throw new ConfigError('INVALID_CONFIG');}
}
export async function saveConfig(paths:RuntimePaths,next:AppConfig):Promise<void>{await writePrivateAtomic(paths.configFile,stringify(checked(next)));}
export function publicSettings(config:AppConfig,paths:RuntimePaths):PublicSettings{
 const value=checked(config);return {...value,selectionRevision:createHash('sha256').update(JSON.stringify(value)).digest('hex'),store:value.authFile===paths.defaultAuthFile?'shared':'separate'};
}
