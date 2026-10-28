import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,chmod,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {resolvePaths,preparePaths} from './index.js';
import {loadToolConfig,toolConfigRevision} from './tool-config.js';
// Break caught: ambient/default roots or accepting untrusted/unsafe config grants typed authority.
test('tool config never derives roots from model/environment',async t=>{
 const home=await mkdtemp(join(tmpdir(),'tilde-tool-config-'));t.after(()=>rm(home,{recursive:true,force:true}));
 await mkdir(join(home,'run'),{mode:0o700});const paths=resolvePaths({XDG_RUNTIME_DIR:join(home,'run')},home,process.geteuid!());await preparePaths(paths,process.geteuid!());
 const root=join(home,'work');await mkdir(root,{mode:0o700});const file=join(dirname(paths.configFile),'tools.toml');
 assert.deepEqual(await loadToolConfig(paths,[]),{version:1,roots:[],retentionDays:7});
 await writeFile(file,`version=1\nroots=["${root}/."]\nretentionDays=7\n`,{mode:0o600});
 const config=await loadToolConfig(paths,[paths.stateDir]);assert.deepEqual(config,{version:1,roots:[root],retentionDays:7});
 assert.equal(toolConfigRevision(config),toolConfigRevision({...config,roots:[root]}));assert.notEqual(toolConfigRevision(config),toolConfigRevision({...config,retentionDays:8}));
 for(const raw of ['version=1\nroots=[]\nretentionDays=0','version=1\nroots=[]\nretentionDays=366','version=1\nroots=[]\nretentionDays=7\ncommand="grant"',`version=1\nroots=["${home}"]\nretentionDays=7`,`version=1\nroots=["relative"]\nretentionDays=7`,`version=1\nroots=["/"]\nretentionDays=7`]){
  await writeFile(file,raw);await assert.rejects(loadToolConfig(paths,[paths.stateDir]),raw);
 }
 await writeFile(file,`version=1\nroots=["${root}"]\nretentionDays=7`);await chmod(file,0o644);await assert.rejects(loadToolConfig(paths,[]));await chmod(file,0o600);
 await symlink(root,join(home,'alias'));await writeFile(file,`version=1\nroots=["${home}/alias"]\nretentionDays=7`);await assert.rejects(loadToolConfig(paths,[]));
});
