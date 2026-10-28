import {createHash} from 'node:crypto';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {lstat} from 'node:fs/promises';
import {readPrivateFile} from './files.js';
import {parse} from 'smol-toml';
import {ConfigError,inspectDirectory,type RuntimePaths} from './paths.js';
export type ToolConfig={version:1;roots:string[];retentionDays:number};
export const toolPolicyVersion='m2-2';
export function pathsOverlap(a:string,b:string):boolean {const contains=(x:string,y:string)=>{const r=relative(x,y);return r===''||(!r.startsWith('../')&&r!=='..'&&!isAbsolute(r));};return contains(a,b)||contains(b,a);}
export function protectedToolPaths(paths:RuntimePaths,extra:readonly string[]=[]):string[]{
 const home=resolve(paths.defaultAuthFile,'../../../');
 return [dirname(paths.configFile),paths.defaultAuthFile,paths.stateDir,paths.runtimeDir,...['.ssh','.gnupg','.aws','.local/share/keyrings'].map(p=>join(home,p)),...extra].map(p=>resolve(p));
}
export async function loadToolConfig(paths:RuntimePaths,protectedPaths:readonly string[]):Promise<ToolConfig>{
 const raw=await readPrivateFile(join(dirname(paths.configFile),'tools.toml'),65536);
 if(raw===undefined)return {version:1,roots:[],retentionDays:7};
 try{
  const v=parse(raw) as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='retentionDays,roots,version'||v.version!==1||!Number.isInteger(v.retentionDays)||Number(v.retentionDays)<1||Number(v.retentionDays)>365||!Array.isArray(v.roots)||v.roots.length>16)throw 0;
  const deny=protectedToolPaths(paths,protectedPaths);const roots:string[]=[];
  for(const path of v.roots){
   if(typeof path!=='string'||!isAbsolute(path)||path.includes('\0')||Buffer.byteLength(path)>4096)throw 0;
   const root=resolve(path);if(deny.some(p=>pathsOverlap(root,p))||roots.includes(root))throw 0;
   await inspectDirectory(root,process.geteuid!());const s=await lstat(root);if(!s.isDirectory()||s.uid!==process.geteuid!()||(s.mode&0o022))throw 0;
   roots.push(root);
  }
  return {version:1,roots:roots.sort(),retentionDays:Number(v.retentionDays)};
 }catch{throw new ConfigError('INVALID_TOOL_CONFIG');}
}
export function toolConfigRevision(config:ToolConfig):string{return createHash('sha256').update(JSON.stringify([toolPolicyVersion,config.version,[...config.roots].sort(),config.retentionDays])).digest('hex');}
