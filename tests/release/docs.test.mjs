import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';import {join,resolve} from 'node:path';
import {buildDocs} from '../../scripts/build-docs.mjs';
async function temporary(t){const home=await mkdtemp('/tmp/tilde-docs-');t.after(()=>rm(home,{recursive:true,force:true}));return home;}
test('docsWorkAtRootAndProjectSubpath',async t=>{
 const home=await temporary(t);
 for(const basePath of ['/','/tilde/']){const output=join(home,basePath==='/'?'root':'project');const result=await buildDocs({root:resolve('.'),output,basePath});assert.ok(result.files.includes('guide/index.html'));const index=await readFile(join(output,'guide/index.html'),'utf8');assert.ok(index.includes('href="'+basePath+'guide/installation.html"'));assert.ok(index.includes('<h1'));assert.ok(!index.includes('<pre class="doc">'));assert.ok(index.includes('Tilde'));const old=await readFile(join(output,'installation.html'),'utf8');assert.ok(old.includes('href="'+basePath+'guide/installation.html"'));}
});
test('siteContainsNoPrivateOrMissingLinks',async t=>{
 const home=await temporary(t),output=join(home,'site');const result=await buildDocs({root:resolve('.'),output,basePath:'/project/'});
 for(const name of result.files.filter(p=>p.endsWith('.html'))){const html=await readFile(join(output,name),'utf8');assert.doesNotMatch(html,/\.superpowers|\/home\/davide|<script|onerror=/i);for(const [,href] of html.matchAll(/(?:href|src)="([^"#]+)"/g)){if(href.startsWith('https://')){assert.equal(new URL(href).protocol,'https:');continue;}assert.ok(href.startsWith('/project/'));assert.ok(result.files.includes(href.slice('/project/'.length)),href);}}
});
test('documentationIsEscapedAndUnsafeInputRefused',async t=>{
 const home=await temporary(t),root=join(home,'source');await mkdir(join(root,'docs/public'),{recursive:true});await mkdir(join(root,'docs/site'),{recursive:true});
 for(const name of ['index.html','style.css','guide.html']){const contents=await readFile(join('docs/site',name)).catch(e=>{if(e.code==='ENOENT'&&name==='guide.html')return readFile('docs/site/index.html');throw e;});await writeFile(join(root,'docs/site',name),contents);}
 await writeFile(join(root,'docs/public/index.md'),'# Synthetic\n\n<script>alert(1)</script> & <b>literal</b> {{ literal }}');
 const output=join(home,'site');const built=await buildDocs({root,output,basePath:'/'});assert.ok(built.files.includes('guide/index.html'));const html=await readFile(join(output,'guide/index.html'),'utf8');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
 for(const basePath of ['/../','/bad path/','//remote/','/a/%2f/'])await assert.rejects(buildDocs({root,output:join(home,'bad-'+Math.random()),basePath}));
 await symlink(join(root,'docs/public/index.md'),join(root,'docs/public/private.md'));await assert.rejects(buildDocs({root,output:join(home,'linked'),basePath:'/'}));
});
test('semanticGuidesResolveUnicodeDuplicateHeadingsAndFragments',async t=>{
 const home=await temporary(t),root=join(home,'source');await mkdir(join(root,'docs/public'),{recursive:true});await mkdir(join(root,'docs/site'),{recursive:true});
 for(const name of ['index.html','style.css','guide.html']){const contents=await readFile(join('docs/site',name)).catch(e=>{if(e.code==='ENOENT'&&name==='guide.html')return readFile('docs/site/index.html');throw e;});await writeFile(join(root,'docs/site',name),contents);}
 await writeFile(join(root,'docs/public/index.md'),'# Café & setup\n\n## Your choice\n\n## Your choice\n\n[Second](#your-choice-2)\n\n[Unicode](#caf%C3%A9-setup)\n\n```sh\nprintf "<safe>"\n```\n\n- First\n- Second\n');
 const output=join(home,'site');const r=await buildDocs({root,output,basePath:'/tilde/'});assert.ok(r.files.includes('guide/index.html'));const html=await readFile(join(output,'guide/index.html'),'utf8');assert.match(html,/<h1 id="café-setup"/);assert.match(html,/<h2 id="your-choice-2"/);assert.match(html,/<pre><code/);assert.match(html,/<ul>/);assert.ok(html.includes('&lt;safe&gt;'));
 await writeFile(join(root,'docs/public/index.md'),'# Synthetic\n\n[Missing](#does-not-exist)');await assert.rejects(buildDocs({root,output:join(home,'missing'),basePath:'/'}),/DOCS_FRAGMENT_MISSING/);
 for(const url of ['%6a%61vascript:alert','//example.invalid','data:text/plain,unsafe','https://user:password@example.invalid/']){await writeFile(join(root,'docs/public/index.md'),'# Synthetic\n\n[Unsafe]('+url+')');let safe;try{const out=join(home,'unsafe-'+Math.random());await buildDocs({root,output:out,basePath:'/'});safe=await readFile(join(out,'guide/index.html'),'utf8');}catch(error){assert.match(error.message,/DOCS_LINK/);continue;}assert.doesNotMatch(safe,/<a[^>]+href="(?:javascript:|data:|\/\/|%6a)/i);}
});
