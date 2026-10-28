import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';import {join,resolve} from 'node:path';
import {buildDocs} from '../../scripts/build-docs.mjs';
async function temporary(t){const home=await mkdtemp('/tmp/tilde-docs-');t.after(()=>rm(home,{recursive:true,force:true}));return home;}
test('docsWorkAtRootAndProjectSubpath',async t=>{
 const home=await temporary(t);
 for(const basePath of ['/','/tilde/']){const output=join(home,basePath==='/'?'root':'project');const result=await buildDocs({root:resolve('.'),output,basePath});assert.ok(result.files.includes('index.html'));const index=await readFile(join(output,'index.html'),'utf8');assert.ok(index.includes('href="'+basePath+'installation.html"'));assert.ok(index.includes('Tilde'));}
});
test('siteContainsNoPrivateOrMissingLinks',async t=>{
 const home=await temporary(t),output=join(home,'site');const result=await buildDocs({root:resolve('.'),output,basePath:'/project/'});
 for(const name of result.files.filter(p=>p.endsWith('.html'))){const html=await readFile(join(output,name),'utf8');assert.doesNotMatch(html,/\.superpowers|\/home\/davide|<script|onerror=/i);for(const [,href] of html.matchAll(/(?:href|src)="([^"#]+)"/g)){if(href.startsWith('https://')){assert.equal(new URL(href).protocol,'https:');continue;}assert.ok(href.startsWith('/project/'));assert.ok(result.files.includes(href.slice('/project/'.length)),href);}}
});
test('documentationIsEscapedAndUnsafeInputRefused',async t=>{
 const home=await temporary(t),root=join(home,'source');await mkdir(join(root,'docs/public'),{recursive:true});await mkdir(join(root,'docs/site'),{recursive:true});
 for(const name of ['index.html','style.css'])await writeFile(join(root,'docs/site',name),await readFile(join('docs/site',name)));
 await writeFile(join(root,'docs/public/index.md'),'# Synthetic\n\n<script>alert(1)</script> & <b>literal</b> {{ literal }}');
 const output=join(home,'site');await buildDocs({root,output,basePath:'/'});const html=await readFile(join(output,'index.html'),'utf8');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
 for(const basePath of ['/../','/bad path/','//remote/','/a/%2f/'])await assert.rejects(buildDocs({root,output:join(home,'bad-'+Math.random()),basePath}));
 await symlink(join(root,'docs/public/index.md'),join(root,'docs/public/private.md'));await assert.rejects(buildDocs({root,output:join(home,'linked'),basePath:'/'}));
});
