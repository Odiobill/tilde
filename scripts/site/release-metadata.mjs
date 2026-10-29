import {publicCoreAssets} from '../release/publication-assets.mjs';
const hex=(x,n)=>typeof x==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(x);
const fail=()=>{throw Error('SITE_RELEASE_NOT_VERIFIED');};
export function validateReleaseConfig(c){
 if(!c||c.version!==1||c.repository!=='Odiobill/tilde'||c.productVersion!=='0.1.1'||c.tag!=='v0.1.1'||!hex(c.baselineCommit,40)||c.source?.kind!=='github'||c.source.commit!==c.baselineCommit||c.source.url!==`https://github.com/Odiobill/tilde/tree/${c.baselineCommit}`||c.package?.name!==publicCoreAssets[0]||!hex(c.package.sha256,64)||c.preview!==true)fail();
 const r=c.package.requirements;if(!r||r.distribution!=='Arch Linux'||r.architecture!=='x86_64'||r.node!=='>=22.19.0'||r.qt!=='>=6.12.0')fail();
 if(!Array.isArray(c.assets)||c.assets.length!==publicCoreAssets.length||new Set(c.assets.map(a=>a.name)).size!==publicCoreAssets.length||c.assets.some(a=>!publicCoreAssets.includes(a.name)||!hex(a.sha256,64))||c.assets.find(a=>a.name===c.package.name)?.sha256!==c.package.sha256)fail();
 return c;
}
export function resolveDownloads(config,evidence,{mode='preview'}={}){
 const c=validateReleaseConfig(config);if(!['preview','production'].includes(mode))fail();
 const result={available:false,packageUrl:null,sourceUrl:c.source.url,requirements:c.package.requirements,links:{},version:c.productVersion};
 if(!evidence){if(mode==='production')fail();return result;}
 if(evidence.version!==1||evidence.repository!==c.repository||evidence.tag!==c.tag||evidence.baselineCommit!==c.baselineCommit||!Number.isSafeInteger(evidence.releaseId)||evidence.releaseId<=0||evidence.draft!==false||evidence.prerelease!==true||!hex(evidence.publicationManifestSha256,64)||!Array.isArray(evidence.assets))fail();
 const expected=[...publicCoreAssets,'publication-manifest.json','SHA256SUMS'];
 if(evidence.assets.length!==expected.length||new Set(evidence.assets.map(a=>a.name)).size!==expected.length)fail();
 for(const a of evidence.assets){if(!expected.includes(a.name)||!hex(a.sha256,64)||a.url!==`https://github.com/Odiobill/tilde/releases/download/v0.1.1/${a.name}`)fail();const configured=c.assets.find(x=>x.name===a.name);if(configured&&configured.sha256!==a.sha256||a.name==='publication-manifest.json'&&a.sha256!==evidence.publicationManifestSha256)fail();result.links[a.name]=a.url;}
 return{...result,available:true,packageUrl:result.links[c.package.name]};
}
