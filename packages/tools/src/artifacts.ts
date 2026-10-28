import{constants}from'node:fs';import{open,lstat,unlink}from'node:fs/promises';import{join}from'node:path';import{readPrivateFile,inspectDirectory}from'@tilde/config';import{payloadFiles,payloadText}from'./payloads.js';import{createHash}from'node:crypto';
import{ToolError,type OperationRecord}from'./types.js';
// Only deterministic, provenance-bound private artifacts. Never configured user targets.
export async function artifactFiles(stateDir:string,record:OperationRecord,names:readonly string[],prune:boolean):Promise<number>{
 const dir=join(stateDir,'operations');let total=0;
 for(const name of [...names,...(record.policy?.source==='m3'?payloadFiles(record.id):[])]){if(!/^(?:(?:fs|backup)-[a-f0-9]{64}\.json|process-[a-f0-9]{64}\.(?:payload|receipt)\.json|payload-[a-f0-9]{64}-(?:request|output)\.txt)$/.test(name)||!name.includes(record.id))throw new ToolError('UNSAFE_ARTIFACT');
  const path=join(dir,name),raw=await readPrivateFile(path,record.policy?.source==='m3'?67108864:524288);if(raw===undefined)continue;if(name.startsWith('payload-')){const kind=name.endsWith('-request.txt')?'request':'output',expected=payloadText(record,kind);if(expected!==undefined&&createHash('sha256').update(expected).digest('hex')!==createHash('sha256').update(raw).digest('hex'))throw new ToolError('UNSAFE_ARTIFACT');}else{const value=JSON.parse(raw) as {id?:string;fingerprint?:string;requestDigest?:string};if(value.id!==record.id||value.fingerprint!==record.fingerprint||value.requestDigest!==undefined&&value.requestDigest!==record.requestDigest)throw new ToolError('UNSAFE_ARTIFACT');}total+=Buffer.byteLength(raw);
  if(prune){await inspectDirectory(dir,process.geteuid!());const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const a=await handle.stat(),b=await lstat(path);if(!a.isFile()||a.nlink!==1||a.uid!==process.geteuid!()||a.mode&0o077||a.dev!==b.dev||a.ino!==b.ino)throw new ToolError('UNSAFE_ARTIFACT');await unlink(path);}finally{await handle.close();}}
 }
 if(prune){try{const parent=await open(dir,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await parent.sync();}finally{await parent.close();}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 return prune?0:total;
}
