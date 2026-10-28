import { constants } from 'node:fs';
import { open, lstat, rename, unlink, type FileHandle } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { absolute, inspectDirectory, ConfigError } from './paths.js';
export async function readPrivateFile(path:string,maxBytes:number):Promise<string|undefined>{
 absolute(path);await inspectDirectory(dirname(path),process.geteuid!());
 let handle;
 try {handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new ConfigError('FILE_UNREADABLE');}
 try{
  const stat=await handle.stat();
  if(!stat.isFile()||stat.uid!==process.geteuid!()||(stat.mode&0o077)!==0)throw new ConfigError('UNSAFE_FILE');
  if(stat.size>maxBytes)throw new ConfigError('FILE_TOO_LARGE');
  const data=Buffer.alloc(maxBytes+1);let length=0;
  while(length<data.length){const {bytesRead}=await handle.read(data,length,data.length-length,null);if(!bytesRead)break;length+=bytesRead;}
  if(length>maxBytes)throw new ConfigError('FILE_TOO_LARGE');
  return new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(0,length));
 }finally{await handle.close();}
}
export async function writePrivateAtomic(path:string,bytes:string,beforeRename?:()=>void|Promise<void>,io:{rename?:typeof rename;sync?:(file:FileHandle)=>Promise<void>;privateDirectory?:boolean;maxExistingBytes?:number}={}):Promise<void>{
 absolute(path);const dir=dirname(path);await inspectDirectory(dir,process.geteuid!(),io.privateDirectory!==false);
 const directory=await lstat(dir);if(directory.uid!==process.geteuid!()||(directory.mode&0o022))throw new ConfigError('UNSAFE_DIRECTORY');
 const maxExisting=io.maxExistingBytes??8*1024*1024;if(!Number.isSafeInteger(maxExisting)||maxExisting<1||maxExisting>67108864)throw new ConfigError('FILE_TOO_LARGE');await readPrivateFile(path,maxExisting);
 const temp=join(dir,`.tilde-${randomUUID()}.tmp`);let handle;
 try{
  handle=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await handle.writeFile(bytes);await (io.sync?io.sync(handle):handle.sync());await handle.close();handle=undefined;
  await beforeRename?.();
  // Refuse unsafe replacements even if the destination changed during preparation.
  try{const s=await lstat(path);if(!s.isFile()||s.uid!==process.geteuid!()||(s.mode&0o077))throw new ConfigError('UNSAFE_FILE');}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  await (io.rename??rename)(temp,path);const parent=await open(dir,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await parent.sync();}finally{await parent.close();}
 }catch{throw new ConfigError('WRITE_FAILED');}
 finally{await handle?.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw new ConfigError('TEMP_CLEANUP_FAILED');});}
}
