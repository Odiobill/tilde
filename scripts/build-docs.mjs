import {readFile,readdir,lstat,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname,relative,posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {noSymlinkParents} from './release/files.mjs';
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function base(value){if(typeof value!=='string'||!/^\/(?:[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/)*$/.test(value)||value.split('/').some(s=>s==='.'||s==='..'))throw Error('DOCS_BASE_PATH_INVALID');return value;}
export async function buildDocs({root=resolve('.'),output,basePath='/'}){
 basePath=base(basePath);root=resolve(root);output=resolve(output);await noSymlinkParents('/',output);
 const sources=[];
 for(const directory of ['docs/public','docs/development']){
  const entries=await readdir(join(root,directory),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return[];throw e;});
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(!entry.name.endsWith('.md')||directory.endsWith('development')&&!/^m4-[a-z0-9-]+\.md$/.test(entry.name))continue;
   if(!entry.isFile()||!/^[a-z0-9][a-z0-9.-]*\.md$/.test(entry.name))throw Error('DOCS_SOURCE_UNSAFE');
   const path=join(directory,entry.name);await noSymlinkParents(root,join(root,path));const info=await lstat(join(root,path));if(!info.isFile()||info.isSymbolicLink()||info.size>262144)throw Error('DOCS_SOURCE_UNSAFE');
   const text=await readFile(join(root,path),'utf8');if(/\.superpowers|\/home\/davide|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|(?:sk-|ghp_)[A-Za-z0-9]{16}/.test(text))throw Error('DOCS_PRIVATE_CONTENT');
   const file=(directory==='docs/public'?'':'development/')+entry.name.replace(/\.md$/,'.html'),title=text.match(/^# (.+)$/m)?.[1];if(!title)throw Error('DOCS_TITLE_MISSING');sources.push({path,file,text,title});
  }
 }
 const order=['index.html','installation.html','source-build.html','configuration.html','limitations.html','security.html','troubleshooting.html','contributing.html','releasing.html','release-notes-0.1.0.html'];sources.sort((a,b)=>(order.includes(a.file)?order.indexOf(a.file):100)-(order.includes(b.file)?order.indexOf(b.file):100)||a.file.localeCompare(b.file));
 if(!sources.some(s=>s.file==='index.html'))throw Error('DOCS_INDEX_MISSING');
 for(const source of sources){source.links=[];for(const match of source.text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)){
  const [label,url]=[match[1],match[2]];
  if(/^https:\/\//.test(url)){const parsed=new URL(url);if(parsed.username||parsed.password)throw Error('DOCS_LINK_UNSAFE');source.links.push({label,url});continue;}
  if(url.startsWith('#'))continue;
  if(url.startsWith('/')||url.includes('\\')||url.includes('%')||url.includes(':'))throw Error('DOCS_LINK_UNSAFE');
  const target=posix.normalize(posix.join(posix.dirname(source.path),url.split('#')[0]));const known=sources.find(s=>s.path===target);if(!known)throw Error('DOCS_LINK_MISSING');source.links.push({label,url:basePath+known.file});
 }}
 for(const name of ['index.html','style.css']){const path=join(root,'docs/site',name);await noSymlinkParents(root,path);const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink())throw Error('DOCS_TEMPLATE_UNSAFE');}
 const template=(await readFile(join(root,'docs/site/index.html'),'utf8')).replaceAll('href="style.css"','href="{{BASE}}style.css"').replaceAll('href="index.html"','href="{{BASE}}index.html"'),css=await readFile(join(root,'docs/site/style.css'),'utf8');
 if(/\{\{(?!(?:TITLE|BASE|NAV|BODY)\}\})/.test(template))throw Error('DOCS_TEMPLATE_INVALID');
 await mkdir(output,{mode:0o700});const files=[];
 for(const source of sources){
  const nav=sources.map(s=>`<a href="${basePath+s.file}"${s.file===source.file?' aria-current="page"':''}>${escape(s.title)}</a>`).join('\n');
  const links=source.links.length?'<aside class="links" aria-label="Related documents">'+source.links.map(l=>`<p><a href="${escape(l.url)}">${escape(l.label)}</a></p>`).join('')+'</aside>':'';
  const substitutions={TITLE:escape(source.title),BASE:basePath,NAV:nav,BODY:'<pre class="doc">'+escape(source.text)+'</pre>'+links};
  const html=template.replace(/\{\{(TITLE|BASE|NAV|BODY)\}\}/g,(_,key)=>substitutions[key]);
  const path=join(output,source.file);await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,html,{flag:'wx',mode:0o644});files.push(source.file);
 }
 await writeFile(join(output,'style.css'),css,{flag:'wx',mode:0o644});files.push('style.css');
 const manifest={version:1,basePath,files:await Promise.all(files.map(async path=>({path,sha256:createHash('sha256').update(await readFile(join(output,path))).digest('hex')}))),sourceDocuments:sources.map(s=>({path:s.path,sha256:createHash('sha256').update(s.text).digest('hex')}))};
 await writeFile(join(output,'docs-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o644});files.push('docs-manifest.json');return{output,basePath,files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const{values}=parseArgs({options:{output:{type:'string'},'base-path':{type:'string'}}});if(!values.output)throw Error('DOCS_OUTPUT_REQUIRED');console.log(JSON.stringify(await buildDocs({output:values.output,basePath:values['base-path']??'/'}),null,2));}
