import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const hex=(v,n)=>typeof v==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(v);
const safePath=p=>typeof p==='string'&&p.length<=512&&/^[A-Za-z0-9_.\/-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(x=>!x||x==='.'||x==='..');
export function validateSourceRecord(record){
 if(!record||record.version!==1||record.repository!=='Odiobill/tilde'||record.tag!=='v0.1.1'||!hex(record.baselineCommit,40)||!hex(record.canonicalArchiveSha256,64)||!Array.isArray(record.files)||!record.files.length||record.files.length>20000)throw Error('SOURCE_IDENTITY_RECORD_INVALID');
 const names=new Set();
 for(const f of record.files){
  if(!f||!safePath(f.path)||names.has(f.path)||f.path.split('/').some(p=>['.git','.superpowers','.aws','.codex','.agents','.env','node_modules','.build','dist','__pycache__','experiments'].includes(p))||f.path.startsWith('docs/superpowers/'))throw Error('SOURCE_IDENTITY_PATH_INVALID');names.add(f.path);
  if(f.type==='file'){if(![0o644,0o755].includes(f.mode)||!hex(f.sha256,64)||f.target!==undefined)throw Error('SOURCE_IDENTITY_FILE_INVALID');}
  else if(f.type==='symlink'){if(f.mode!==0o777||typeof f.target!=='string'||!f.target||f.target.length>512||f.target.startsWith('/')||f.target.includes('\\')||f.sha256!==undefined)throw Error('SOURCE_IDENTITY_LINK_INVALID');}
  else throw Error('SOURCE_IDENTITY_TYPE_INVALID');
 }
 const links=new Map(record.files.filter(f=>f.type==='symlink').map(f=>[f.path,posix.normalize(posix.join(posix.dirname(f.path),f.target))]));
 for(const [name,target] of links){let at=target;const seen=new Set([name]);while(links.has(at)){if(seen.has(at))throw Error('SOURCE_IDENTITY_LINK_CYCLE');seen.add(at);at=links.get(at);}if(!names.has(at))throw Error('SOURCE_IDENTITY_LINK_ESCAPE');}
 for(const name of names){const p=name.split('/');if(p.some((_,i)=>i>0&&links.has(p.slice(0,i).join('/'))))throw Error('SOURCE_IDENTITY_LINK_PARENT');}
 return record;
}
export async function verifySourceIdentity({repositoryRoot,commit,canonicalManifest,canonicalArchiveSha256}){
 const record=validateSourceRecord({version:1,repository:'Odiobill/tilde',tag:'v0.1.1',baselineCommit:commit,canonicalArchiveSha256,files:canonicalManifest?.files});
 if(canonicalManifest.version!=='0.1.1'||canonicalManifest.archiveSha256&&canonicalManifest.archiveSha256!==canonicalArchiveSha256)throw Error('SOURCE_IDENTITY_MANIFEST_INVALID');
 const git=async args=>(await exec('git',['--no-replace-objects','-C',repositoryRoot,...args],{encoding:'buffer',maxBuffer:64*1024*1024,timeout:30000})).stdout;
 try{
  const tag=(await git(['rev-parse','refs/tags/v0.1.1^{commit}'])).toString().trim();if(tag!==commit)throw Error('SOURCE_IDENTITY_TAG_MISMATCH');
  const entries=(await git(['ls-tree','-r','-z','--full-tree',commit])).toString().split('\0').filter(Boolean);if(entries.length!==record.files.length)throw Error('SOURCE_IDENTITY_MEMBERSHIP_MISMATCH');
  const expected=new Map(record.files.map(f=>[f.path,f]));
  for(const entry of entries){const match=entry.match(/^(100644|100755|120000) blob ([a-f0-9]{40})\t(.+)$/);if(!match)throw Error('SOURCE_IDENTITY_GIT_TYPE_INVALID');const [,mode,object,path]=match,f=expected.get(path);if(!f)throw Error('SOURCE_IDENTITY_PATH_MISMATCH');const bytes=await git(['cat-file','blob',object]);
   if(mode==='120000'){if(f.type!=='symlink'||bytes.toString()!==f.target)throw Error('SOURCE_IDENTITY_LINK_MISMATCH');}
   else if(f.type!=='file'||f.mode!==(mode==='100755'?0o755:0o644)||sha(bytes)!==f.sha256)throw Error('SOURCE_IDENTITY_BLOB_OR_MODE_MISMATCH');
  }
 }catch(error){if(error.message.startsWith('SOURCE_IDENTITY_'))throw error;throw Error('SOURCE_IDENTITY_GIT_READ_FAILED');}
 return{...record,files:[...record.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
}
export async function verifySourceArchive({archivePath,format,sourceRecord}){
 validateSourceRecord(sourceRecord);if(!['tar','zip'].includes(format))throw Error('SOURCE_ARCHIVE_FORMAT_INVALID');
 const scratch=await mkdtemp(join(tmpdir(),'tilde-source-archive-'));
 try{const record=join(scratch,'record.json');await writeFile(record,JSON.stringify(sourceRecord),{mode:0o600,flag:'wx'});
  const {stdout}=await exec('python3',[join(dirname(fileURLToPath(import.meta.url)),'github-source-archive.py'),'--archive',archivePath,'--format',format,'--record',record],{timeout:120000,maxBuffer:1024*1024});return JSON.parse(stdout);
 }catch{throw Error('SOURCE_ARCHIVE_IDENTITY_OR_STRUCTURE_INVALID');}finally{await rm(scratch,{recursive:true,force:true});}
}
