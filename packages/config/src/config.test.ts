import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, lstat, readFile, writeFile, symlink, chmod, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePaths, preparePaths, loadConfig, saveConfig, publicSettings } from './index.js';
const uid=process.geteuid!();
async function fixture(t:TestContext) {
 const home=await mkdtemp(join(tmpdir(),'tilde-config-'));
 t.after(()=>rm(home,{recursive:true,force:true}));
 const run=join(home,'run'); await mkdir(run,{mode:0o700});
 return {home,paths:resolvePaths({XDG_RUNTIME_DIR:run},home,uid)};
}
test('default paths are independent of CLI and do not create the shared store',async t=>{
 const {home,paths}=await fixture(t); await preparePaths(paths,uid);
 assert.equal(paths.defaultAuthFile,join(home,'.pi/agent/auth.json'));
 assert.equal(paths.configFile,join(home,'.config/tilde/config.toml'));
 assert.equal(paths.socketPath,join(home,'run/tilde/agent.sock'));
 const config=await loadConfig(paths);
 assert.deepEqual(config,{version:1,providerId:'opencode-go',modelId:'deepseek-v4.1-flash',authFile:paths.defaultAuthFile});
 await assert.rejects(lstat(join(home,'.pi')), {code:'ENOENT'});
 for(const dir of [dirname(paths.configFile),paths.stateDir,paths.runtimeDir])assert.equal((await lstat(dir)).mode&0o777,0o700);
});
test('absolute separate store and model survive atomic save and reload with stable revision',async t=>{
 const {home,paths}=await fixture(t); await preparePaths(paths,uid);
 const next={version:1 as const,providerId:'opencode-go' as const,modelId:'another-model',authFile:join(home,'private/auth.json')};
 const before=publicSettings(await loadConfig(paths),paths);
 await saveConfig(paths,next); const loaded=await loadConfig(paths);
 assert.deepEqual(loaded,next); assert.equal((await lstat(paths.configFile)).mode&0o777,0o600);
 const saved=await readFile(paths.configFile,'utf8');assert.ok(!saved.includes('key'));
 const settings=publicSettings(loaded,paths);assert.equal(settings.store,'separate');
 assert.notEqual(settings.selectionRevision,before.selectionRevision);
 assert.equal(settings.selectionRevision,publicSettings({...next},paths).selectionRevision);
});
test('relative runtime and auth paths and secret/extra config fields are rejected',async t=>{
 const {home,paths}=await fixture(t);
 for(const runtime of [undefined,'relative'])assert.throws(()=>resolvePaths({XDG_RUNTIME_DIR:runtime},home,uid));
 assert.throws(()=>resolvePaths({XDG_RUNTIME_DIR:join(home,'run'),XDG_STATE_HOME:'relative'},home,uid));
 await preparePaths(paths,uid);const config=await loadConfig(paths);
 await assert.rejects(saveConfig(paths,{...config,authFile:'relative'}));
 await assert.rejects(saveConfig(paths,{...config,key:'synthetic'} as typeof config));
 await assert.rejects(lstat(paths.configFile),{code:'ENOENT'});
});
test('preflight rejects symlink and file collisions before creating other leaves',async t=>{
 const {home,paths}=await fixture(t);const stateParent=dirname(paths.stateDir);
 await mkdir(stateParent,{recursive:true});await writeFile(paths.stateDir,'collision');
 await assert.rejects(preparePaths(paths,uid));await assert.rejects(lstat(dirname(paths.configFile)),{code:'ENOENT'});
 await rm(paths.stateDir);await symlink(join(home,'run'),paths.stateDir);
 await assert.rejects(preparePaths(paths,uid));assert.equal((await lstat(paths.stateDir)).isSymbolicLink(),true);
});
test('foreign ownership and unsafe existing directories fail without repair',async t=>{
 const {paths}=await fixture(t);await assert.rejects(preparePaths(paths,uid+1));
 await mkdir(paths.stateDir,{recursive:true,mode:0o755});
 await assert.rejects(preparePaths(paths,uid));assert.equal((await lstat(paths.stateDir)).mode&0o777,0o755);
});
test('invalid or oversized TOML is not defaulted or overwritten',async t=>{
 const {paths}=await fixture(t);await preparePaths(paths,uid);
 for(const raw of ['[invalid','version=2\n','key="synthetic"\n','x'.repeat(65537)]){
  await writeFile(paths.configFile,raw,{mode:0o600});await assert.rejects(loadConfig(paths));assert.equal(await readFile(paths.configFile,'utf8'),raw);
 }
});
test('unsafe file, symlink and failed config write retain original bytes',async t=>{
 const {home,paths}=await fixture(t);await preparePaths(paths,uid);const config=await loadConfig(paths);
 await saveConfig(paths,config);const old=await readFile(paths.configFile,'utf8');
 await chmod(paths.configFile,0o644);await assert.rejects(loadConfig(paths));await assert.rejects(saveConfig(paths,config));
 assert.equal(await readFile(paths.configFile,'utf8'),old);await chmod(paths.configFile,0o600);
 await chmod(dirname(paths.configFile),0o500);await assert.rejects(saveConfig(paths,{...config,modelId:'changed'}));
 assert.equal(await readFile(paths.configFile,'utf8'),old);await chmod(dirname(paths.configFile),0o700);
 await rm(paths.configFile);const target=join(home,'target');await writeFile(target,old,{mode:0o600});await symlink(target,paths.configFile);
 await assert.rejects(loadConfig(paths));await assert.rejects(saveConfig(paths,config));assert.equal(await readFile(target,'utf8'),old);
});
