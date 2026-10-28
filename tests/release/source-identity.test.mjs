import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const api=await import('../../scripts/release/source-identity.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const dir=await mkdtemp('/tmp/tilde-source-id-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
 git('init','-q');git('config','user.name','Synthetic fixture');git('config','user.email','fixture@example.invalid');
 await writeFile(join(dir,'readme.txt'),'Synthetic source\n');await writeFile(join(dir,'run.sh'),'#!/bin/sh\nexit 0\n',{mode:0o755});git('add','.');git('commit','-qm','fixture');git('tag','v0.1.0');
 const commit=git('rev-parse','HEAD'),files=[{path:'readme.txt',type:'file',mode:0o644,sha256:sha('Synthetic source\n')},{path:'run.sh',type:'file',mode:0o755,sha256:sha('#!/bin/sh\nexit 0\n')}];
 const args={repositoryRoot:dir,commit,canonicalManifest:{version:'0.1.0',files},canonicalArchiveSha256:'a'.repeat(64)};
 return{dir,git,args,files};
}
function required(name){assert.equal(typeof api[name],'function',`Missing source identity behavior: ${name}`);return api[name];}
test('gitSourceMatchesCompleteCanonicalInventory',async t=>{const f=await fixture(t);const r=await required('verifySourceIdentity')(f.args);assert.equal(r.baselineCommit,f.args.commit);assert.deepEqual(r.files,f.files);assert.equal(r.repository,'Odiobill/tilde');});
test('changedBlobExecutableModeExtraFileAndMovedTagAreRejected',async t=>{
 for(const change of ['blob','mode','extra','tag']){const f=await fixture(t);if(change==='blob')await writeFile(join(f.dir,'readme.txt'),'changed');if(change==='mode')await chmod(join(f.dir,'run.sh'),0o644);if(change==='extra')await writeFile(join(f.dir,'extra'),'extra');
 f.git('add','.');if(change==='tag')await writeFile(join(f.dir,'readme.txt'),'tag moved');f.git('add','.');f.git('commit','--allow-empty','-qm','changed');if(change==='tag')f.git('tag','-f','v0.1.0');
 const commit=change==='tag'?f.args.commit:f.git('rev-parse','HEAD');await assert.rejects(required('verifySourceIdentity')({...f.args,commit}),/SOURCE_IDENTITY/);}
});
test('gitGeneratedTarAndZipNormalizeOnlyPackagingDifferences',async t=>{
 const f=await fixture(t),record=await required('verifySourceIdentity')(f.args);
 for(const format of ['tar','zip']){const archivePath=join(f.dir,'source.'+format);f.git('archive','--format='+format,'--prefix=tilde-synthetic/','--output='+archivePath,f.args.commit);assert.deepEqual(await required('verifySourceArchive')({archivePath,format,sourceRecord:record}),{valid:true,files:2});}
});
test('unsafeOrIncompleteGeneratedArchiveRejectsBeforeExtraction',async t=>{
 const f=await fixture(t),record=await required('verifySourceIdentity')(f.args);
 const archivePath=join(f.dir,'unsafe.zip');
 for(const variant of ['missing','extra','traversal','duplicate','link','mode']){
 execFileSync('python3',['-c',`import zipfile,sys\np=sys.argv[1];kind=sys.argv[2]\nwith zipfile.ZipFile(p,'w') as z:\n z.writestr('wrapper/readme.txt','Synthetic source\\n')\n i=zipfile.ZipInfo('wrapper/run.sh');i.create_system=3;i.external_attr=(0o100755<<16);z.writestr(i,'#!/bin/sh\\nexit 0\\n')\n if kind=='missing': pass\n elif kind=='extra': z.writestr('wrapper/extra','x')\n elif kind=='traversal': z.writestr('wrapper/../escape','x')\n elif kind=='duplicate': z.writestr('wrapper/readme.txt','duplicate')\n elif kind=='link':\n  i=zipfile.ZipInfo('wrapper/link');i.create_system=3;i.external_attr=(0o120777<<16);z.writestr(i,'../../escape')\n`,archivePath,variant],{stdio:['ignore','ignore','ignore']});
 const changed=structuredClone(record);if(variant==='missing')changed.files.push({path:'missing',type:'file',mode:0o644,sha256:'b'.repeat(64)});if(variant==='mode')changed.files[1].mode=0o644;
 await assert.rejects(required('verifySourceArchive')({archivePath,format:'zip',sourceRecord:changed}),/SOURCE_ARCHIVE/);
 }
});
