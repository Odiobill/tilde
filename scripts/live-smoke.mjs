// Historical M1 helper; M1 authorizations are consumed. M2 uses m2-live-smoke.mjs.
console.error('M1_SMOKE_RETIRED: use the separately authorized bounded M2 helper.');process.exit(2);
// Explicit opt-in only. This connects to the owner's already-running source daemon.
if(process.argv.length!==3||process.argv[2]!=='--opt-in'){
 console.error('OPT_IN_REQUIRED: start your source daemon, then pass --opt-in for one bounded live conversation.');process.exit(2);
}
const {resolvePaths}=await import('../packages/config/dist/index.js');
const {Client}=await import('../apps/daemon/dist/fixtures/client.js');
const {homedir}=await import('node:os');const {randomUUID}=await import('node:crypto');const {setTimeout:delay}=await import('node:timers/promises');
const paths=resolvePaths(process.env,homedir(),process.geteuid());let client;let accepted=false;const report={status:'failed',providerId:'opencode-go',modelId:'deepseek-v4.1-flash',partialObserved:false,finalDurable:false,independentSelection:false};
try{
 client=new Client(paths.socketPath);const hello=await client.ready();if(!hello.ok)throw Error('HELLO_FAILED');const settings=hello.result.settings;
 if(settings.providerId!==report.providerId||settings.modelId!==report.modelId)throw Error('LIVE_TARGET_MISMATCH');
 if(hello.result.capabilities.tools||hello.result.capabilities.codeMode)throw Error('UNEXPECTED_EXECUTION_CAPABILITY');
 report.independentSelection=true;const initial=(await client.request('conversation.get',{})).result;
 if(initial.state==='running')throw Error('BUSY');const before=new Set(initial.entries.map(e=>e.id));await client.request('conversation.subscribe',{});
 const ack=await client.request('conversation.submit',{requestId:randomUUID(),text:'Explain how to inspect a Linux user service without executing commands.',selectionRevision:settings.selectionRevision});
 if(!ack.ok)throw Error(ack.error.code);accepted=true;
 let final;const deadline=Date.now()+65000;
 while(Date.now()<deadline){report.partialObserved||=client.frames.some(f=>f.view?.partial?.text);client.frames.length=0;const response=await client.request('conversation.get',{});if(!response.ok)throw Error(response.error.code);final=response.result;if(final.state==='failed'||final.state==='blocked')throw Error(final.errorCode??'LIVE_FAILED');if(final.state==='idle'&&final.entries.some(e=>!before.has(e.id)&&e.role==='assistant'))break;await delay(250);}
 if(!final||final.state!=='idle')throw Error('LIVE_TIMEOUT');
 const newEntries=final.entries.filter(e=>!before.has(e.id));if(!newEntries.some(e=>e.role==='user')||!newEntries.some(e=>e.role==='assistant'&&e.text.length))throw Error('LIVE_EMPTY_RESULT');
 client.close();client=new Client(paths.socketPath);await client.ready();const reopened=(await client.request('conversation.get',{})).result;report.finalDurable=newEntries.every(e=>reopened.entries.some(x=>x.id===e.id));
 report.status=report.partialObserved&&report.finalDurable?'passed':'failed';report.errorCode=report.status==='passed'?undefined:'LIVE_EVIDENCE_INCOMPLETE';
}catch(error){report.errorCode=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'LIVE_CHECK_FAILED';}
finally{client?.close();report.accepted=accepted;console.log(JSON.stringify(report,null,2));}
process.exitCode=report.status==='passed'?0:1;
