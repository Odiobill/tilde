import { mkdir,mkdtemp,readFile,writeFile,rm,open,lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join,resolve,basename,dirname,isAbsolute } from 'node:path';
import { cpus,totalmem,release } from 'node:os';
import { randomUUID,createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { runCommand } from './release/commands.mjs';
import { childEnvironment } from './release/runtime.mjs';
import { writeQualificationReport } from './release/report.mjs';
import { noSymlinkParents } from './release/files.mjs';
import { observeDesktop } from './qualify-desktops.mjs';
import { distribution,referenceQualified } from '../tests/integration/dist/m4-performance.js';
export function validPerformanceGrant(v,{observed,evidence,binarySha256,now=Date.now()}){
 return !!v&&v.version===1&&v.ownerApproved===true&&typeof v.ownerStatement==='string'&&v.ownerStatement.length>0&&v.sessionId===observed?.id&&observed?.uid===process.geteuid()&&observed?.remote===false&&['wayland','x11'].includes(observed?.type)&&v.evidence===evidence&&v.binarySha256===binarySha256&&Number.isInteger(v.maxDurationMs)&&v.maxDurationMs>=1&&v.maxDurationMs<=240000&&Date.parse(v.expiresAt)>now&&v.allowDesktopChanges===false&&v.providerRequests===0;
}
async function claim(file,context){
 if(!file)throw Error('PERFORMANCE_NATIVE_GRANT_REQUIRED');file=resolve(file);await noSymlinkParents('/',file);const parent=await lstat(dirname(file));if(parent.uid!==process.geteuid()||(parent.mode&0o777)!==0o700)throw Error('PERFORMANCE_GRANT_UNSAFE');
 const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let v;try{const s=await fd.stat();if(!s.isFile()||s.uid!==process.geteuid()||s.nlink!==1||(s.mode&0o777)!==0o600||s.size>8192)throw Error('PERFORMANCE_GRANT_UNSAFE');v=JSON.parse(await fd.readFile('utf8'));}finally{await fd.close();}
 if(!validPerformanceGrant(v,context))throw Error('PERFORMANCE_GRANT_INVALID');const consumed=await open(file+'.consumed','wx',0o600);try{await consumed.writeFile(JSON.stringify({evidence:context.evidence,binarySha256:context.binarySha256,consumedAt:new Date().toISOString()})+'\n');await consumed.sync();}finally{await consumed.close();}return v;
}
function fact(log,marker){const line=log.split('\n').find(s=>s.includes(marker+' '));return line?JSON.parse(line.slice(line.indexOf(marker+' ')+marker.length+1)):null;}
export async function qualifyPerformance({evidence,mode='offscreen',grant,root=resolve('.')}){
 if(!['offscreen','native'].includes(mode))throw Error('PERFORMANCE_MODE_INVALID');evidence=resolve(evidence);await mkdir(evidence,{mode:0o700});
 const binary=join(root,'.build/cmake/apps/gui/tst_product_ui'),binarySha256=createHash('sha256').update(await readFile(binary)).digest('hex'),observed=observeDesktop();
 const approval=mode==='native'?await claim(grant,{evidence,binarySha256,observed}):null;
 const deadline=performance.now()+(approval?.maxDurationMs??240000),backend=mode==='offscreen'?'offscreen':observed.type==='wayland'?'wayland':'xcb';
 const records=[],resources=[],timings=[];let cleanup=true;
 const run=async(name,slot,extra,maximum)=>{
  const home=await mkdtemp('/tmp/tilde-m4-perf-'),unit='tilde-m4-perf-'+randomUUID()+'.service';await mkdir(join(home,'run'),{mode:0o700});
  const env={PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:home,TMPDIR:home,XDG_CONFIG_HOME:join(home,'config'),XDG_STATE_HOME:join(home,'state'),XDG_CACHE_HOME:join(home,'cache'),XDG_DATA_HOME:join(home,'data'),XDG_RUNTIME_DIR:join(home,'run'),QT_QPA_PLATFORM:backend,QT_QPA_PLATFORMTHEME:'generic',QT_NO_XDG_DESKTOP_PORTAL:'1',QML_DISABLE_DISK_CACHE:'1',QSG_INFO:'1',...(mode==='offscreen'?{QT_QUICK_BACKEND:'software'}:{}),...extra};
  if(backend==='wayland'){const display=process.env.WAYLAND_DISPLAY;if(!display)throw Error('PERFORMANCE_WAYLAND_MISSING');const path=isAbsolute(display)?display:join(process.env.XDG_RUNTIME_DIR,pathSafe(display));const s=await lstat(path);if(!s.isSocket()||s.uid!==process.geteuid())throw Error('PERFORMANCE_WAYLAND_UNSAFE');env.WAYLAND_DISPLAY=path;}
  if(backend==='xcb'){if(!/^:\d+(?:\.\d+)?$/.test(process.env.DISPLAY??''))throw Error('PERFORMANCE_LOCAL_X11_REQUIRED');env.DISPLAY=process.env.DISPLAY;if(process.env.XAUTHORITY)env.XAUTHORITY=process.env.XAUTHORITY;}
  const remaining=Math.floor(deadline-performance.now());if(remaining<=14000)throw Error('PERFORMANCE_DEADLINE');const limit=Math.min(maximum,remaining-14000),startedAtMs=Date.now();
  const outer=childEnvironment(process.execPath,{HOME:home,TMPDIR:home});
  try{
   const result=await runCommand({executable:'/usr/bin/systemd-run',args:['--user','--quiet','--wait','--pipe','--collect','--unit='+unit,'--property=MemoryMax=1G','--property=TasksMax=128','--property=RuntimeMaxSec='+Math.ceil(limit/1000)+'s','--property=TimeoutStopSec=2s','--property=KillMode=control-group','--property=UMask=0077','/usr/bin/env','-i',...Object.entries(env).map(([k,v])=>k+'='+v),'dbus-run-session','--',binary,slot],cwd:root,env:outer,evidence,name,timeout:limit+3000});
   return {result,log:await readFile(join(evidence,name+'.log'),'utf8'),startedAtMs};
  }finally{
   spawnSync('/usr/bin/systemctl',['--user','stop',unit],{env:outer,timeout:4000,stdio:'ignore'});
   spawnSync('/usr/bin/systemctl',['--user','reset-failed',unit],{env:outer,timeout:3000,stdio:'ignore'});
   const check=spawnSync('/usr/bin/systemctl',['--user','show',unit,'-p','LoadState','--value'],{env:outer,timeout:3000,encoding:'utf8'});const absent=check.stdout?.trim()==='not-found';cleanup&&=absent;await rm(home,{recursive:true,force:true});records.push({name,unit,unitAbsent:absent,privateHomeRemoved:true});
  }
 };
 for(const fixture of ['rows','bytes']){const r=await run('resources-'+fixture,'m4BoundedPerformance',{TILDE_M4_RESOURCE_CASE:fixture},80000);resources.push({fixture,...r.result,qtVersion:r.log.match(/QtTest library ([0-9.]+)/)?.[1]??null,facts:fact(r.log,'M4_RESOURCE_FACT')});}
 for(let i=0;i<5;i++){const r=await run('timing-'+i,'m4FocusTimings',{TILDE_M4_TIMING:'1'},12000),facts= fact(r.log,'M4_TIMING_FACT');timings.push({...r.result,facts,coldMs:facts?facts.coldReadyAtMs-r.startedAtMs:null});}
 const resourcesPassed=resources.every(r=>r.exitCode===0&&!r.timedOut&&r.facts?.backend===backend&&r.facts?.submissions===0&&r.facts?.decisions===0&&r.facts?.readyMs<3000&&r.facts?.phases?.length===2&&r.facts.phases.every(p=>p.samples.length===30&&p.samples.every(s=>s.rssKiB>0&&s.rssKiB<512*1024&&s.cpuSeconds>=0&&s.cpuSeconds<.25&&s.contentPositionChanges<5)));
 const warmMs=timings.flatMap(r=>r.facts?.warm?.map(w=>w.ms)??[]),coldMs=timings.map(r=>r.coldMs).filter(n=>n!==null),reconnectMs=timings.map(r=>r.facts?.reconnectMs).filter(n=>n!==undefined);
 const focused=timings.every(r=>r.exitCode===0&&!r.timedOut&&r.facts?.backend===backend&&r.facts?.focused===true&&r.facts?.warm?.every(w=>w.focused===true)&&r.facts?.submissions===0&&r.facts?.decisions===0);
 const defaultRenderer=mode==='native'&&[...resources,...timings].every(r=>[3,5].includes(r.facts?.graphicsApi));
 const input={backend,defaultRenderer,cleanup,focused,resourcesPassed,warmMs,coldMs,reconnectMs};
 const growth=resources.map(r=>{const phases=r.facts?.phases??[];return {fixture:r.fixture,phases:phases.map(p=>({label:p.label,firstRssKiB:p.samples[0]?.rssKiB,lastRssKiB:p.samples.at(-1)?.rssKiB,peakRssKiB:Math.max(...p.samples.map(s=>s.rssKiB)),peakCpuSeconds:Math.max(...p.samples.map(s=>s.cpuSeconds)),idlePositionChanges:p.samples.reduce((n,s)=>n+s.contentPositionChanges,0)}))};});
 const summary={growth,mode,binarySha256,observed,hardware:{cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem(),kernel:release()},runtime:process.versions.node,...input,distributions:{warm:warmMs.length?distribution(warmMs,300):null,cold:coldMs.length?distribution(coldMs,1500):null,reconnect:reconnectMs.length?distribution(reconnectMs,3000):null},resources,timings,records,coldScope:'Fresh test process spawn through focused primary input; includes private D-Bus startup and initial synthetic IPC/QML; wall-clock milliseconds.',reconnectScope:'Existing GUI ready-to-reconnect barrier after synthetic peer loss; not automatic resumed work.'};
 await writeFile(join(evidence,'measurements.json'),JSON.stringify(summary,null,2)+'\n');
 const pass=referenceQualified(input),cases=[{id:'performance.synthetic',required:false,status:resourcesPassed&&focused&&cleanup?'pass':'fail',environment:`${backend}; ${mode}; Qt fixture; bounded long history/answer`,evidence:['measurements.json'],exitCode:resourcesPassed&&focused&&cleanup?0:1,cleanup,details:{resourcesPassed,focused,defaultRenderer}}, {id:'performance.reference',required:true,status:mode==='native'?(pass?'pass':'fail'):'not_run',environment:mode==='native'?`${observed.desktop}/${observed.type}/${observed.id}; actual default renderer`:'Reference default-renderer compositor focus not exercised by offscreen software',evidence:['measurements.json'],exitCode:mode==='native'?(pass?0:1):null,cleanup:mode==='native'?cleanup:null,details:{warmSamples:warmMs.length,coldSamples:coldMs.length,focusNotAck:true,resourcesPassed,defaultRenderer}}];
 await writeQualificationReport({path:join(evidence,'report.json'),runId:basename(evidence),environment:`M4 performance ${mode}`,cases});return{cases,summary};
}
function pathSafe(s){if(s.includes('/')||s==='..')throw Error('PERFORMANCE_DISPLAY_INVALID');return s;}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const{values}=parseArgs({options:{evidence:{type:'string'},mode:{type:'string'},grant:{type:'string'}}});if(!values.evidence)throw Error('PERFORMANCE_EVIDENCE_REQUIRED');const r=await qualifyPerformance(values);console.log(JSON.stringify({cases:r.cases,distributions:r.summary.distributions},null,2));if(r.cases.some(c=>c.required&&c.status!=='pass'))process.exitCode=1;}
