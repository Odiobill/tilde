import { isAbsolute, join, resolve, dirname } from 'node:path';
import { lstat, mkdir } from 'node:fs/promises';
export type RuntimePaths={configFile:string;stateDir:string;runtimeDir:string;socketPath:string;guiOutboxFile:string;defaultAuthFile:string};
export class ConfigError extends Error { constructor(public readonly code:string){super(code);this.name='ConfigError';} }
export function absolute(path:string):string {
 if(!isAbsolute(path)||path.includes('\0'))throw new ConfigError('UNSAFE_PATH');return resolve(path);
}
export function resolvePaths(env:Record<string,string|undefined>,home:string,_uid:number):RuntimePaths {
 home=absolute(home);
 if(!env.XDG_RUNTIME_DIR)throw new ConfigError('RUNTIME_REQUIRED');
 const config=join(absolute(env.XDG_CONFIG_HOME||join(home,'.config')),'tilde');
 const stateDir=join(absolute(env.XDG_STATE_HOME||join(home,'.local/state')),'tilde');
 const runtimeDir=join(absolute(env.XDG_RUNTIME_DIR),'tilde');
 return {configFile:join(config,'config.toml'),stateDir,runtimeDir,socketPath:join(runtimeDir,'agent.sock'),guiOutboxFile:join(stateDir,'gui-outbox.json'),defaultAuthFile:join(home,'.pi/agent/auth.json')};
}
export async function inspectDirectory(path:string,uid:number,privateLeaf=false):Promise<void> {
 path=absolute(path);const parent=dirname(path);
 if(parent!==path)await inspectDirectory(parent,uid);
 let stat;try{stat=await lstat(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw new ConfigError('PATH_UNREADABLE');}
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.uid!==uid&&stat.uid!==0))throw new ConfigError('UNSAFE_DIRECTORY');
 if(privateLeaf&&(stat.uid!==uid||(stat.mode&0o777)!==0o700))throw new ConfigError('UNSAFE_DIRECTORY');
}
export async function ensurePrivateDirectory(path:string,uid:number):Promise<void>{
 await inspectDirectory(path,uid,true);
 await mkdir(path,{recursive:true,mode:0o700});await inspectDirectory(path,uid,true);
}
export async function preparePaths(paths:RuntimePaths,uid:number):Promise<void>{
 if(uid!==process.geteuid!())throw new ConfigError('WRONG_OWNER');
 const dirs=[dirname(paths.configFile),paths.stateDir,paths.runtimeDir];
 // Validate all existing components before creating any leaf.
 for(const dir of dirs)await inspectDirectory(dir,uid,true);
 for(const dir of dirs)await ensurePrivateDirectory(dir,uid);
}
