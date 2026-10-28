import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { command, root } from './gui-lifecycle.js';
import { privateEnvironment } from './private-environment.js';
import { runCrashCase, crashCases } from './tools-crash.js';
async function temporary(t: import('node:test').TestContext) {
 const home=await mkdtemp('/tmp/tilde-m4-regression-');await mkdir(join(home,'run'),{mode:0o700});t.after(()=>rm(home,{recursive:true,force:true}));return home;
}
test('installedPathsCannotRetargetHelper',async t=>{
 const home=await temporary(t),app=join(home,'app');await mkdir(app);await writeFile(join(app,'package.json'),'{"type":"module"}');
 for(const file of ['desktop-bridge.js','desktop-protocol.js'])await cp(join(root,'apps/daemon/dist',file),join(app,file));
 const fixed={helper:'/usr/lib/tilde/tilde-desktop-bridge',frontend:'/usr/bin/tilde-gui'};
 await writeFile(join(app,'install-paths.js'),'export const installedExecutables=Object.freeze('+JSON.stringify(fixed)+');');
 const script=`const b=await import(${JSON.stringify(pathToFileURL(join(app,'desktop-bridge.js')).href)});console.log(JSON.stringify(b.desktopExecutables));`;
 const result=await command(process.execPath,['--input-type=module','-e',script],{env:{...privateEnvironment(home),TILDE_HELPER:join(home,'forged'),TILDE_GUI:join(home,'forged'),PATH:home},timeout:3000,maxBuffer:4096});
 assert.deepEqual(JSON.parse(result.stdout),fixed);
});
test('runtimeFailurePrecedesUserStateWrite',async t=>{
 const home=await temporary(t),fake=join(home,'unsupported-node'),state=join(home,'state');await mkdir(state,{mode:0o700});
 await writeFile(fake,'#!'+process.execPath+'\nconsole.log('+JSON.stringify(JSON.stringify({version:'20.19.0',napiVersion:9,uvVersion:'1.46.0',capabilities:{sqlite:false,chordLoader:false,nativeTransport:false,nativeFilesystem:false}}))+');\n',{mode:0o700});
 const before=await readdir(state);await assert.rejects(command(process.execPath,[join(root,'scripts/with-runtime.mjs'),'-e',`require('fs').writeFileSync(${JSON.stringify(join(state,'forbidden'))},'unsafe')`],{env:{...privateEnvironment(home),TILDE_NODE:fake,XDG_STATE_HOME:state},timeout:3000,maxBuffer:4096}),e=>String((e as {stderr?:string}).stderr).includes('NODE_UNSUPPORTED'));
 assert.deepEqual(await readdir(state),before);
});
test('staleApprovalOrCorruptReceiptNeverDispatches',async t=>{
 const home=await temporary(t),env={...privateEnvironment(home),QT_QPA_PLATFORM:'offscreen',QT_QUICK_BACKEND:'software',QT_NO_XDG_DESKTOP_PORTAL:'1'};
 const result=await command(join(root,'.build/cmake/apps/gui/tst_approvals'),['changed_fingerprint_cannot_reuse_button'],{env,timeout:15000,maxBuffer:16384});assert.match(result.stdout,/0 failed/);
 // Reuse the existing native corrupt outbox/receipt cases.
 const protocol=await command(join(root,'.build/cmake/apps/gui/tst_chat'),['corruptOutboxIsNeverOverwritten','ackLossSurvivesGuiReopen'],{env,timeout:15000,maxBuffer:32768});assert.match(protocol.stdout,/0 failed/);
});
test('daemonRestartRetainsOriginalEffectIdentity',async()=>{
 for(const name of ['shell-claim-before-launch','write-journal-before-Pi']){
  const report=await runCrashCase(crashCases.find(c=>c.name===name)!);
  assert.ok(report); // runCrashCase asserts original operation/request IDs, attempts and durable unknown outcomes.
 }
});
test('settingsAndTranscriptNavigationAdmitNoWork',async t=>{
 const home=await temporary(t);const result=await command(join(root,'.build/cmake/apps/gui/tst_product_ui'),['settingsReturnKeepsDraft','settingsEscapeKeepsDraft','liveUpdateDoesNotStealScroll'],{env:{...privateEnvironment(home),QT_QPA_PLATFORM:'offscreen',QT_QUICK_BACKEND:'software',QT_NO_XDG_DESKTOP_PORTAL:'1'},timeout:15000,maxBuffer:32768});assert.match(result.stdout,/0 failed/);
});
import { distribution, referenceQualified } from './m4-performance.js';
test('referenceFocusCannotBeReplacedByAckOrOffscreen',()=>{
 const native={backend:'wayland',defaultRenderer:true,cleanup:true,focused:true,warmMs:Array(10).fill(12),coldMs:Array(5).fill(100),reconnectMs:Array(5).fill(50),resourcesPassed:true};
 assert.equal(referenceQualified(native),true);
 for(const change of [{backend:'offscreen'},{focused:false},{defaultRenderer:false},{cleanup:false},{warmMs:[1]},{coldMs:[1]},{warmMs:Array(10).fill(300)},{coldMs:Array(5).fill(1500)},{reconnectMs:Array(5).fill(3000)},{resourcesPassed:false}])assert.equal(referenceQualified({...native,...change}),false);
 assert.equal(distribution([10,300,15],300).misses,1);assert.throws(()=>distribution([NaN],300));
});
