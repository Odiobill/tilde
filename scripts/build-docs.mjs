import {readFile,readdir,lstat,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';import {pathToFileURL} from 'node:url';import {parseArgs} from 'node:util';import {createHash} from 'node:crypto';
import {noSymlinkParents} from './release/files.mjs';
import {renderGuide} from './site/markdown.mjs';import {basePath as validateBase,guideRoute,resolveGuideLink} from './site/routes.mjs';
export const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const digest=b=>createHash('sha256').update(b).digest('hex');
async function sourceFile(root,path){await noSymlinkParents(root,join(root,path));const stat=await lstat(join(root,path));if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144)throw Error('DOCS_SOURCE_UNSAFE');return readFile(join(root,path),'utf8');}
export async function buildDocs({root=resolve('.'),output,basePath='/',mode='preview',releaseEvidence}){
 basePath=validateBase(basePath);root=resolve(root);output=resolve(output);await noSymlinkParents('/',output);
 if(!['preview','production'].includes(mode))throw Error('DOCS_MODE_INVALID');
 const sources=[];
 for(const directory of ['docs/public','docs/development']){
  const entries=await readdir(join(root,directory),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return[];throw e;});
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(!entry.name.endsWith('.md')||directory.endsWith('development')&&!/^m4-[a-z0-9-]+\.md$/.test(entry.name))continue;
   if(!entry.isFile()||!/^[a-z0-9][a-z0-9.-]*\.md$/.test(entry.name))throw Error('DOCS_SOURCE_UNSAFE');
   const path=join(directory,entry.name),text=await sourceFile(root,path);
   if(/\.superpowers|\/home\/davide|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|(?:sk-|ghp_)[A-Za-z0-9]{16}/.test(text))throw Error('DOCS_PRIVATE_CONTENT');
   const title=text.match(/^# (.+)$/m)?.[1];if(!title)throw Error('DOCS_TITLE_MISSING');
   sources.push({path,text,title,file:guideRoute(path,{basePath:'/'}).slice(1),headings:renderGuide(text,{resolveLink:()=> '#'}).headings});
  }
 }
 if(!sources.some(s=>s.file==='guide/index.html'))throw Error('DOCS_INDEX_MISSING');
 const order=['index','getting-started','installation','source-build','configuration','qualification','limitations','security','troubleshooting','contributing','releasing','release-notes-0.1.0'];
 sources.sort((a,b)=>{const rank=s=>{const n=s.file.slice(6,-5);return order.includes(n)?order.indexOf(n):100;};return rank(a)-rank(b)||a.file.localeCompare(b.file);});
 const template=await sourceFile(root,'docs/site/guide.html'),css=await sourceFile(root,'docs/site/style.css');
 if(/\{\{(?!(?:TITLE|BASE|NAV|BODY)\}\})/.test(template))throw Error('DOCS_TEMPLATE_INVALID');
 for(const s of sources)s.body=renderGuide(s.text,{resolveLink:url=>resolveGuideLink(s.path,url,{basePath,sources})}).html;
 await mkdir(output,{mode:0o700});const files=[];
 const emit=async(name,body)=>{await mkdir(dirname(join(output,name)),{recursive:true,mode:0o700});await writeFile(join(output,name),body,{flag:'wx',mode:0o644});files.push(name);};
 for(const s of sources){const nav=sources.map(x=>'<a href="'+basePath+x.file+'"'+(s===x?' aria-current="page"':'')+'>'+escape(x.title)+'</a>').join('\n');
  const values={TITLE:escape(s.title),BASE:basePath,NAV:nav,BODY:s.body};await emit(s.file,template.replace(/\{\{(TITLE|BASE|NAV|BODY)\}\}/g,(_,key)=>values[key]));
  const old=s.file.slice(6),target=basePath+s.file;await emit(old,'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(s.title)+' · Tilde</title><link rel="canonical" href="https://odiobill.github.io'+target+'"></head><body><main><h1>'+escape(s.title)+'</h1><p>This guide now lives at <a href="'+target+'">'+escape(s.title)+'</a>.</p></main></body></html>');
 }
 await emit('style.css',css);
 const manifest={version:2,basePath,files:await Promise.all(files.map(async path=>({path,sha256:digest(await readFile(join(output,path)))}))),sourceDocuments:sources.map(s=>({path:s.path,sha256:digest(s.text)}))};
 await emit('docs-manifest.json',JSON.stringify(manifest,null,2)+'\n');return{output,basePath,files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const{values}=parseArgs({options:{output:{type:'string'},'base-path':{type:'string'},mode:{type:'string'},'release-evidence':{type:'string'}}});if(!values.output)throw Error('DOCS_OUTPUT_REQUIRED');const releaseEvidence=values['release-evidence']?JSON.parse(await readFile(values['release-evidence'])):undefined;console.log(JSON.stringify(await buildDocs({output:values.output,basePath:values['base-path']??'/',mode:values.mode??'preview',releaseEvidence})));}
