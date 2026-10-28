import{createHash}from'node:crypto';import type{WorkState}from'@tilde/protocol';
export type NoticeKind='completion'|'approval'|'attention';export type NoticeInput={v:1;id:string;kind:NoticeKind};
export const noticeTemplates={completion:{title:'Tilde finished',body:'Open Tilde to view the reply.'},approval:{title:'Tilde needs your approval',body:'Open Tilde to review the exact action.'},attention:{title:'Tilde needs attention',body:'Open Tilde to inspect the current status.'}} as const;
export type DesktopPort={start():Promise<boolean>;notify(input:NoticeInput):Promise<'delivered'|'unavailable'|'failed'>;close():Promise<void>;onOpen(fn:(id:string)=>void):()=>void;onStatus(fn:(status:WorkState['desktopStatus'])=>void):()=>void};
export type NotificationOptions={bridge:DesktopPort;ledger?:{claimNotice(input:{id:string;conversationId:string;kind:NoticeKind;at:number}):boolean;pruneNotices(before:number):void};preferences():Promise<{notifyCompletion:boolean;notifyAttention:boolean}>;conversations:{work():Promise<WorkState>;watchCatalog(query:{query:string},listener:(v:{work:WorkState})=>void):Promise<{work:WorkState;stop():Promise<void>}>;authorize(cid:string):Promise<unknown>;noticeOutcome(cid:string,runId:string):Promise<'completed'|'failed'|'cancelled'|'unsettled'|'unknown'>;setDesktopStatus(status:WorkState['desktopStatus']):void};launch(cid?:string):void};
type Fact={id:string;kind:NoticeKind;cid:string};
const eventId=(...parts:string[])=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
function facts(w:WorkState):Map<string,Fact>{
 const result=new Map<string,Fact>();const add=(kind:NoticeKind,cid:string,...parts:string[])=>{const id=eventId(cid,kind,...parts);result.set(id,{id,kind,cid});};
 for(const op of w.attention){if(op.status==='awaiting_approval'||op.status==='outcome_unknown')add(op.status==='awaiting_approval'?'approval':'attention',op.conversationId,op.id,op.fingerprint,op.status);}
 if(w.budgetPause){const p=w.budgetPause;add('attention',p.conversationId,'budget',p.runId,p.revision);}
 else if(w.activeConversationId&&['blocked','storage_failed','concurrent_recovery'].includes(w.status))add('attention',w.activeConversationId,w.activeRunId??'',w.status,w.errorCode??'');
 return result;
}
export class NotificationCoordinator{
 private line=Promise.resolve();private closed=false;private started=false;private accepting=false;private faulted=false;
 private previous?:WorkState;private priorFacts=new Map<string,Fact>();private prefs={notifyCompletion:false,notifyAttention:false};
 private watch?:{stop():Promise<void>};private pending?:WorkState;private draining=false;private opens=new Map<string,string>();private offs:(()=>void)[]=[];
 constructor(private readonly options:NotificationOptions){}
 private status(s:WorkState['desktopStatus']){this.options.conversations.setDesktopStatus(this.faulted?'failed':s);}
 private fail(){this.faulted=true;this.accepting=false;this.pending=undefined;this.status('failed');}
 private enqueue(fn:()=>Promise<void>):Promise<void>{this.line=this.line.then(async()=>{if(!this.closed)await fn();}).catch(()=>{if(!this.closed)this.fail();});return this.line;}
 private seed(w:WorkState){this.previous=w;this.priorFacts=facts(w);}
 async start():Promise<void>{if(this.started||this.closed)return;this.started=true;
  this.offs.push(this.options.bridge.onStatus(s=>{if(!this.closed)this.status(this.prefs.notifyAttention||this.prefs.notifyCompletion?s:'disabled');}));
  this.offs.push(this.options.bridge.onOpen(id=>{void this.enqueue(async()=>{const cid=this.opens.get(id);if(!cid)return;try{await this.options.conversations.authorize(cid);this.options.launch(cid);}catch{this.status('failed');this.options.launch();}});}));
  await this.preferencesChanged();
 }
 private observe(w:WorkState){if(this.closed||!this.accepting)return;this.pending=w;if(this.draining)return;this.draining=true;void this.enqueue(async()=>{try{while(this.pending&&!this.closed){const next=this.pending;this.pending=undefined;await this.process(next);}}finally{this.draining=false;}});}
 async preferencesChanged():Promise<void>{return this.enqueue(async()=>{this.accepting=false;this.pending=undefined;this.prefs=await this.options.preferences();
  if(this.faulted){this.status('failed');return;}
  if(this.prefs.notifyCompletion||this.prefs.notifyAttention){if(!this.options.ledger){this.fail();return;}this.options.ledger.pruneNotices(Math.max(0,Date.now()-30*86400000));const available=await this.options.bridge.start();this.status(available?'ready':'unavailable');
   if(!this.watch){const attached=await this.options.conversations.watchCatalog({query:''},({work})=>this.observe(work));this.watch=attached;this.seed(attached.work);}else this.seed(await this.options.conversations.work());this.accepting=true;
  }else{await this.options.bridge.close();await this.watch?.stop();this.watch=undefined;this.opens.clear();this.previous=undefined;this.priorFacts.clear();this.status('disabled');}
 });}
 private async attempt(f:Fact){if(this.closed||this.faulted||!(f.kind==='completion'?this.prefs.notifyCompletion:this.prefs.notifyAttention))return;
  let claimed=false;try{claimed=this.options.ledger!.claimNotice({id:f.id,conversationId:f.cid,kind:f.kind,at:Date.now()});}catch{this.fail();return;}if(!claimed)return;
  if(this.opens.size>=16)this.opens.delete(this.opens.keys().next().value!);this.opens.set(f.id,f.cid);
  let result:'delivered'|'unavailable'|'failed';try{result=await this.options.bridge.notify({v:1,id:f.id,kind:f.kind});}catch{result='failed';}
  if(result!=='delivered'){this.opens.delete(f.id);if(!this.closed)this.status(result);}else if(!this.closed)this.status('ready');
 }
 private async process(w:WorkState){const old=this.previous,next=facts(w),prior=this.priorFacts;this.seed(w);
  for(const f of next.values())if(!prior.has(f.id))await this.attempt(f);
  if(old?.activeConversationId&&old.activeRunId&&(old.activeRunId!==w.activeRunId||old.activeConversationId!==w.activeConversationId)){
   // A terminal public Pi submission, rather than disappearing UI activity, establishes success.
   const outcome=await this.options.conversations.noticeOutcome(old.activeConversationId,old.activeRunId);
   if(outcome==='failed'||outcome==='completed'&&['ready','running'].includes(w.status))await this.attempt({id:eventId(old.activeConversationId,old.activeRunId,outcome),cid:old.activeConversationId,kind:outcome==='completed'?'completion':'attention'});
  }
 }
 settle():Promise<void>{return this.line;}
 async close():Promise<void>{if(this.closed)return;this.closed=true;this.accepting=false;this.pending=undefined;for(const off of this.offs)off();await this.options.bridge.close();await this.watch?.stop();await this.line;this.opens.clear();}
}
