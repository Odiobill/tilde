import test from'node:test';import assert from'node:assert/strict';import{pathToFileURL}from'node:url';import{resolve}from'node:path';
const boundary=async()=>{const path=pathToFileURL(resolve('scripts/m3-smoke-boundary.mjs')).href;return await import(path) as{createSmokeBoundary():{wrap<T>(model:T):T;metrics():{requests:number;denied:number}}};};
test('m3SmokeForcesExactNarrowOptionsAndOffersNoTools',async()=>{const{createSmokeBoundary}=await boundary(),gate=createSmokeBoundary();let seen:unknown;const models={streamSimple(_m:unknown,_c:unknown,o:unknown){seen=o;return'ok';}};const wrapped=gate.wrap(models);wrapped.streamSimple({provider:'opencode-go',id:'deepseek-v4.1-flash'},{tools:[]},{maxTokens:999999,timeoutMs:999999,maxRetries:9});assert.deepEqual(seen,{maxTokens:8192,timeoutMs:60000,maxRetries:0});assert.throws(()=>wrapped.streamSimple({provider:'opencode-go',id:'deepseek-v4.1-flash'},{tools:[{name:'shell_run'}]},{}),/SMOKE_TOOLS_FORBIDDEN/);});
test('m3SmokeRefusesSecondRequestAcrossModelRebinding',async()=>{const{createSmokeBoundary}=await boundary(),gate=createSmokeBoundary();let calls=0;const model=()=>({streamSimple(_m?:unknown,_c?:unknown,_o?:unknown){calls++;return'ok';}});gate.wrap(model()).streamSimple({provider:'opencode-go',id:'deepseek-v4.1-flash'},{tools:[]},{});assert.throws(()=>gate.wrap(model()).streamSimple({provider:'opencode-go',id:'deepseek-v4.1-flash'},{tools:[]},{}),/SMOKE_REQUEST_LIMIT/);assert.equal(calls,1);assert.deepEqual(gate.metrics(),{requests:1,denied:1});});

test('m3LiveHelperRefusesBeforeCredentialOrNetworkAccess',async()=>{const{command,root}=await import('./gui-lifecycle.js');await assert.rejects(command(process.execPath,[resolve(root,'scripts/m3-live-smoke.mjs')],{env:{PATH:'/unusable',HOME:'/no-credentials',XDG_RUNTIME_DIR:''}}),e=>typeof e==='object'&&e!==null&&'code'in e&&e.code===2);});
test('m3ActualHelperSharedAndSeparateWithSocketsAndFetchDenied',async()=>{const{toolFixture}=await import('./tool-fixtures.js');const{command,root}=await import('./gui-lifecycle.js');const{mkdir,readFile}=await import('node:fs/promises');const{join}=await import('node:path');const{fileURLToPath}=await import('node:url');const{saveConfig}=await import('@tilde/config');const{saveApiKey,openCredentialStore}=await import('@tilde/credentials');for(const scope of ['shared','separate'] as const){const f=await toolFixture();try{await mkdir(join(f.home,'temp'),{mode:0o700});await mkdir(join(f.home,'separate'),{mode:0o700});const config={...f.config,authFile:scope==='shared'?f.paths.defaultAuthFile:join(f.home,'separate/auth.json')};await saveConfig(f.paths,config);await saveApiKey(openCredentialStore(config.authFile,{scope}),'opencode-go','synthetic-m3-smoke-key');const marker=join(f.home,'fetch-marker');let output='';try{output=(await command(process.execPath,['--import',fileURLToPath(new URL('./m3-smoke-network-fixture.js',import.meta.url)),join(root,'scripts/m3-live-smoke.mjs'),'--opt-in','--auth-file',config.authFile],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:f.home,TMPDIR:join(f.home,'temp'),XDG_CONFIG_HOME:join(f.home,'.config'),XDG_STATE_HOME:join(f.home,'.local/state'),XDG_RUNTIME_DIR:join(f.home,'run'),TILDE_FIXTURE_FETCH_MARKER:marker},timeout:10000,maxBuffer:8192})).stdout;}catch(e){assert.equal((e as{code?:unknown}).code,1);output=String((e as{stdout?:string}).stdout??'');}const report=JSON.parse(output);assert.equal(report.accepted,true);assert.equal(report.requests,1);assert.equal(report.toolCalls,0);assert.equal(report.toolLimit,0);assert.equal(report.shellLimit,0);assert.equal(report.requestLimit,1);assert.equal(report.timeoutMs,60000);assert.equal(report.outputCapPerRequest,8192);assert.equal(report.retries,0);assert.equal(report.credentialScope,scope);assert.equal(report.credentialStore,config.authFile);assert.equal(report.status,'failed');assert.equal(await readFile(marker,'utf8'),'denied\n');assert.equal(await readFile(marker+'.sockets','utf8'),'denied\n');}finally{await f.remove();}}});

for(const name of ['frontendExitLeavesRunAlive','twoConversationsApprovalAndBudgetRecovery','historyPagingWhileAnotherRunStreams','largeApprovalAndReceiptAfterRestart','storageFailureKeepsCleanupAndNoFalseSuccess','allNewSurfacesKeepSyntheticSecretsPrivate'] as const)test(name,async()=>{const cases=await import('./m3-ui.js');assert.equal((await cases[name]()).pass,true);});

// A completed real M3 response is absent from the old compatibility-view stopReason filter.
// The subprocess must qualify retained public history, without weakening strict completion.
for(const mode of ['stop','length','empty','http-error'] as const){
 test(`m3ActualHelperRetainedCompletion:${mode}`,async()=>{
  const {toolFixture}=await import('./tool-fixtures.js');
  const {command,root}=await import('./gui-lifecycle.js');
  const {mkdir,readFile}=await import('node:fs/promises');
  const {join}=await import('node:path');
  const {fileURLToPath}=await import('node:url');
  const {saveConfig}=await import('@tilde/config');
  const {saveApiKey,openCredentialStore}=await import('@tilde/credentials');
  const f=await toolFixture();
  try{
   await mkdir(join(f.home,'temp'),{mode:0o700});await mkdir(join(f.home,'separate'),{mode:0o700});
   const config={...f.config,authFile:join(f.home,'separate/auth.json')};await saveConfig(f.paths,config);
   await saveApiKey(openCredentialStore(config.authFile,{scope:'separate'}),'opencode-go','synthetic-m3-completed-key');
   const marker=join(f.home,'offline-transport');let stdout='',exitCode=0;
   try{stdout=(await command(process.execPath,['--import',fileURLToPath(new URL('./m3-smoke-response-fixture.js',import.meta.url)),join(root,'scripts/m3-live-smoke.mjs'),'--opt-in','--auth-file',config.authFile],{
    env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:f.home,TMPDIR:join(f.home,'temp'),XDG_CONFIG_HOME:join(f.home,'.config'),XDG_STATE_HOME:join(f.home,'.local/state'),XDG_RUNTIME_DIR:join(f.home,'run'),TILDE_FIXTURE_FETCH_MARKER:marker,TILDE_SMOKE_RESPONSE_MODE:mode},timeout:10000,maxBuffer:16384
   })).stdout;}catch(e){exitCode=Number((e as{code?:unknown}).code);stdout=String((e as{stdout?:string}).stdout??'');}
   const report=JSON.parse(stdout);
   assert.equal(report.status,mode==='stop'?'passed':'failed',JSON.stringify(report));
   assert.equal(exitCode,mode==='stop'?0:1);
   assert.equal(report.finalDurable,mode==='stop');
   assert.equal(report.requests,1);assert.equal(report.denied,0);assert.equal(report.toolCalls,0);
   assert.equal(report.requestLimit,1);assert.equal(report.outputCapPerRequest,8192);assert.equal(report.timeoutMs,60000);
   assert.equal(report.retries,0);assert.equal(report.toolLimit,0);assert.equal(report.shellLimit,0);
   assert.equal(report.credentialStore,config.authFile);assert.equal(report.credentialScope,'separate');
   const calls=(await readFile(marker,'utf8')).trim().split('\n').map(s=>JSON.parse(s));
   assert.deepEqual(calls,[{mode,model:'deepseek-v4.1-flash',outputCap:8192,tools:0}]);
   assert.equal(await readFile(marker+'.sockets','utf8'),'denied\n');
  }finally{await f.remove();}
 });
}
