import{createHash}from'node:crypto';
import{Compile}from'typebox/compile';
import{admittedLimitsSchema,budgetIdentitySchema,budgetGrantSchema,byteCheck,type AdmittedLimits,type BudgetIdentity,type BudgetGrant,type RunUsage,type BudgetPause}from'@tilde/protocol';
import type{Journal}from'./journal.js';import{ToolError}from'./types.js';
export interface BudgetGate{install(runId:string,conversationId:string,policy:AdmittedLimits):Promise<void>;reserve(identity:BudgetIdentity,signal?:AbortSignal):Promise<void>;extend(grant:BudgetGrant,actorUid:number):Promise<RunUsage>;usage(conversationId:string,runId:string):Promise<RunUsage>;pauses(conversationId?:string):Promise<BudgetPause[]>;watch(listener:()=>void):()=>void;admitted(conversationId:string,runId:string):AdmittedLimits|undefined;stop(conversationId:string,code:string):Promise<void>;onExtended(listener:(pause:BudgetPause)=>Promise<void>):()=>void;close():Promise<void>}
class BudgetStop extends ToolError {}
type PolicyRow={run_id:string;conversation_id:string;policy:string;budget_revision:string;request_limit:number|null;tool_limit:number|null};
const policyCheck=Compile(admittedLimitsSchema),identityCheck=Compile(budgetIdentitySchema),grantCheck=Compile(budgetGrantSchema);
function canonical(v:unknown):string{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';}
const revision=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
export function createBudgetGate(journal:Journal):BudgetGate{
 let closed=false,failed=false;const waiters=new Set<()=>void>(),listeners=new Set<()=>void>(),extensions=new Set<(pause:BudgetPause)=>Promise<void>>(),active=new Set<Promise<void>>();
 const wake=()=>{for(const w of [...waiters])w();};
 const publish=()=>{wake();for(const l of listeners)try{l();}catch{/* observers grant no authority */}};
 const ready=()=>{if(closed)throw new ToolError('CLOSED');if(failed)throw new ToolError('STORAGE_FAILED');};
 function transaction<T>(fn:()=>T):T{ready();try{return journal.transaction(fn);}catch(e){if(e instanceof BudgetStop||e instanceof ToolError&&e.code!=='STORAGE_FAILED')throw e;failed=true;publish();throw new ToolError('STORAGE_FAILED');}}
 function row(cid:string,runId:string):PolicyRow|undefined{const r=journal.db.prepare('SELECT * FROM run_policies WHERE run_id=?').get(runId) as PolicyRow|undefined;return r?.conversation_id===cid?r:undefined;}
 function stopped(runId:string){const r=journal.db.prepare('SELECT code FROM generation_stops WHERE id=?').get(runId);if(r)throw new BudgetStop(String(r.code));const unknown=journal.db.prepare("SELECT id FROM operations WHERE json_extract(record,'$.call.generationId')=? AND json_extract(record,'$.status')='outcome_unknown' LIMIT 1").get(runId);if(unknown)throw new BudgetStop('OUTCOME_UNKNOWN');}
 function usageSync(cid:string,runId:string):RunUsage{const p=row(cid,runId);if(!p)return null;const counts=journal.db.prepare('SELECT requests,tools FROM counters WHERE id=?').get(runId);return{runId,revision:p.budget_revision,requests:Number(counts?.requests??0),tools:Number(counts?.tools??0),requestLimit:p.request_limit,toolLimit:p.tool_limit};}
 function pauseSync(runId:string):BudgetPause|undefined{const p=journal.db.prepare('SELECT record FROM budget_pauses WHERE run_id=?').get(runId);return p?JSON.parse(String(p.record)):undefined;}
 async function reserve(identity:BudgetIdentity,signal?:AbortSignal):Promise<void>{
  if(!identityCheck.Check(identity)||!byteCheck(budgetIdentitySchema,identity))throw new ToolError('INVALID_IDENTITY');
  for(;;){ready();if(signal?.aborted)throw new ToolError('WAIT_ABORTED');
   let changed=false;const admitted=transaction(()=>{
    const p=row(identity.conversationId,identity.runId);if(!p)throw new ToolError('POLICY_CHANGED');stopped(identity.runId);
    if(identity.kind==='tools'&&journal.db.prepare('SELECT 1 FROM budget_tool_reservations WHERE run_id=? AND task_id=?').get(identity.runId,identity.taskId))return true;
    const u=usageSync(identity.conversationId,identity.runId)!;const used=identity.kind==='requests'?u.requests:u.tools;const limit=identity.kind==='requests'?u.requestLimit:u.toolLimit;
    if(limit!==null&&used>=limit){const prior=pauseSync(identity.runId);if(!prior||prior.taskId!==identity.taskId||prior.kind!==identity.kind||prior.used!==used){const nextRevision=revision([p.budget_revision,identity,used,limit]);const pause:BudgetPause={...identity,revision:nextRevision,used,limit,createdAt:Date.now()};journal.db.prepare('UPDATE run_policies SET budget_revision=? WHERE run_id=?').run(nextRevision,identity.runId);journal.db.prepare('INSERT INTO budget_pauses(run_id,record) VALUES(?,?) ON CONFLICT(run_id) DO UPDATE SET record=excluded.record').run(identity.runId,JSON.stringify(pause));changed=true;}return false;}
    if(used>=Number.MAX_SAFE_INTEGER)throw new ToolError('COUNTER_OVERFLOW');journal.db.prepare(`UPDATE counters SET ${identity.kind}=${identity.kind}+1 WHERE id=?`).run(identity.runId);
    if(identity.kind==='tools')journal.db.prepare('INSERT INTO budget_tool_reservations(run_id,task_id) VALUES(?,?)').run(identity.runId,identity.taskId);changed=true;return true;
   });
   if(admitted){if(changed)publish();return;}
   await new Promise<void>(resolve=>{const done=()=>{waiters.delete(done);signal?.removeEventListener('abort',done);resolve();};waiters.add(done);signal?.addEventListener('abort',done,{once:true});if(changed)publish();if(closed||failed||signal?.aborted)done();});
  }
 }
 const gate:BudgetGate={
  async install(runId,cid,policy){if(!/^[1-9][0-9]{0,127}$/.test(runId)||!/^[1-9][0-9]{0,127}$/.test(cid)||!policyCheck.Check(policy)||!byteCheck(admittedLimitsSchema,policy)||policy.source!=='m3')throw new ToolError('POLICY_CHANGED');const text=canonical(policy);transaction(()=>{const prior=journal.db.prepare('SELECT * FROM run_policies WHERE run_id=?').get(runId) as PolicyRow|undefined;if(prior){if(prior.conversation_id!==cid||prior.policy!==text)throw new ToolError('POLICY_CHANGED');return;}journal.db.prepare('INSERT INTO run_policies(run_id,conversation_id,policy,budget_revision,request_limit,tool_limit) VALUES(?,?,?,?,?,?)').run(runId,cid,text,revision([runId,cid,text]),policy.settings.providerRequests,policy.settings.toolOperations);journal.db.prepare('INSERT OR IGNORE INTO counters(id) VALUES(?)').run(runId);journal.installRetention(runId,policy.settings.retentionDays,policy.settings.retentionBytes);});publish();},
  reserve(identity,signal){const work=reserve(identity,signal);active.add(work);void work.then(()=>active.delete(work),()=>active.delete(work));return work;},
  async extend(grant,actorUid){ready();if(actorUid!==process.geteuid!()||!grantCheck.Check(grant)||!byteCheck(budgetGrantSchema,grant))throw new ToolError('INVALID_GRANT');let paused:BudgetPause|undefined;
   const result=transaction(()=>{
    const text=canonical(grant);const prior=journal.db.prepare('SELECT input,actor,result FROM budget_grants WHERE id=?').get(grant.extensionId);if(prior){if(prior.input!==text||prior.actor!==actorUid)throw new ToolError('GRANT_CONFLICT');const saved=JSON.parse(String(prior.result)) as {usage:RunUsage;pause:BudgetPause};
     const current=usageSync(grant.conversationId,grant.runId);const kind=saved.pause.kind;const unspent=current&&saved.usage&&(kind==='requests'?current.requests===saved.usage.requests:current.tools===saved.usage.tools);
     if(unspent)try{stopped(grant.runId);paused=saved.pause;}catch(e){if(!(e instanceof BudgetStop))throw e;}
     return saved.usage;}
    const p=row(grant.conversationId,grant.runId);if(!p)throw new ToolError('POLICY_CHANGED');stopped(grant.runId);paused=pauseSync(grant.runId);if(!paused)throw new ToolError('NOT_BUDGET_PAUSED');if(p.budget_revision!==grant.expectedRevision||paused.revision!==grant.expectedRevision)throw new ToolError('BUDGET_CHANGED');
    const u=usageSync(grant.conversationId,grant.runId)!;
    for(const {current,next,used} of [{current:u.requestLimit,next:grant.requestLimit,used:u.requests},{current:u.toolLimit,next:grant.toolLimit,used:u.tools}]){if(next!==null&&(current===null||next<=used||next<current))throw new ToolError('INVALID_GRANT');}
    const nextRevision=revision([p.budget_revision,grant,actorUid]);journal.db.prepare('UPDATE run_policies SET budget_revision=?,request_limit=?,tool_limit=? WHERE run_id=?').run(nextRevision,grant.requestLimit,grant.toolLimit,grant.runId);journal.db.prepare('DELETE FROM budget_pauses WHERE run_id=?').run(grant.runId);const usage=usageSync(grant.conversationId,grant.runId);journal.db.prepare('INSERT INTO budget_grants(id,input,actor,result) VALUES(?,?,?,?)').run(grant.extensionId,text,actorUid,JSON.stringify({usage,pause:paused}));return usage;
   });publish();if(paused)for(const listener of extensions)await listener(paused);return result;
  },
  async usage(cid,runId){ready();try{return usageSync(cid,runId);}catch{failed=true;publish();throw new ToolError('STORAGE_FAILED');}},
  async pauses(cid){ready();try{return journal.db.prepare('SELECT record FROM budget_pauses ORDER BY rowid').all().map(r=>JSON.parse(String(r.record)) as BudgetPause).filter(p=>cid===undefined||p.conversationId===cid);}catch{failed=true;publish();throw new ToolError('STORAGE_FAILED');}},
  admitted(cid,runId){ready();try{const p=row(cid,runId);return p?JSON.parse(p.policy):undefined;}catch{failed=true;publish();throw new ToolError('STORAGE_FAILED');}},
  async stop(cid,code){transaction(()=>{const rows=journal.db.prepare('SELECT run_id FROM run_policies WHERE conversation_id=?').all(cid);for(const r of rows)journal.stopGeneration(String(r.run_id),code);});publish();},
  watch(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
  onExtended(listener){extensions.add(listener);return()=>{extensions.delete(listener);};},
  async close(){if(closed)return;closed=true;publish();await Promise.allSettled([...active]);listeners.clear();extensions.clear();}
 };return gate;
}
