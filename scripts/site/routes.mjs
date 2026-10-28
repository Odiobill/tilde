import {posix} from 'node:path';
export function basePath(value){if(typeof value!=='string'||!/^\/(?:[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/)*$/.test(value)||value.split('/').some(x=>x==='.'||x==='..'))throw Error('DOCS_BASE_PATH_INVALID');return value;}
export function guideRoute(sourcePath,{basePath:base='/'}){basePath(base);if(!/^docs\/(?:public\/[a-z0-9][a-z0-9.-]*|development\/m4-[a-z0-9-]+)\.md$/.test(sourcePath))throw Error('DOCS_SOURCE_PATH_INVALID');return base+'guide/'+(sourcePath.startsWith('docs/development/')?'development/':'')+posix.basename(sourcePath,'.md')+'.html';}
export function resolveGuideLink(from,url,{basePath:base,sources}){
 if(typeof url!=='string'||!url||/[\x00-\x20\x7f\\]/.test(url))throw Error('DOCS_LINK_UNSAFE');
 let decoded=url;try{for(let n=0;n<3;n++){const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}}catch{throw Error('DOCS_LINK_UNSAFE');}
 if(/^[a-z][a-z0-9+.-]*:/i.test(decoded)||decoded.startsWith('//')){
  if(!url.startsWith('https://')||!decoded.startsWith('https://'))throw Error('DOCS_LINK_UNSAFE');const target=new URL(url);if(target.username||target.password)throw Error('DOCS_LINK_UNSAFE');return url;
 }
 const [path,...fragments]=url.split('#');if(fragments.length>1||path.startsWith('/')||decoded.includes('\\')||decoded.includes('\0'))throw Error('DOCS_LINK_UNSAFE');
 const sourcePath=path?posix.normalize(posix.join(posix.dirname(from),decodeURIComponent(path))):from;
 const source=sources.find(x=>x.path===sourcePath);if(!source)throw Error('DOCS_LINK_MISSING');
 let fragment='';if(fragments.length){try{fragment=decodeURIComponent(fragments[0]);}catch{throw Error('DOCS_LINK_UNSAFE');}if(!source.headings.some(h=>h.id===fragment))throw Error('DOCS_FRAGMENT_MISSING');}
 return guideRoute(source.path,{basePath:base})+(fragment?'#'+encodeURIComponent(fragment):'');
}
