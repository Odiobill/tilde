import type { SnapshotEvent,AgentEvent,EntryRecord } from '@earendil-works/pi-durable';
import type { AssistantMessage,Message } from '@earendil-works/pi-ai';
import { limits,type ChatView,type DisplayEntry } from '@tilde/protocol';
import { safeCode } from './request-limits.js';
export function clip(text:string,max:number=limits.textBytes):{text:string;truncated:boolean}{
 const bytes=Buffer.from(text);if(bytes.length<=max)return {text,truncated:false};let end=max;while(end>0&&(bytes[end]!&0xc0)===0x80)end--;return {text:bytes.subarray(0,end).toString('utf8'),truncated:true};
}
function text(message:Message):string{
 if(typeof message.content==='string')return message.content;
 return message.content.filter(c=>c.type==='text').map(c=>c.text).join('');
}
export class Projection {
 private entries:EntryRecord[]=[];private partial:AssistantMessage|undefined;private running=false;private lastError:string|undefined;
 constructor(private id:string,snapshot:SnapshotEvent){this.reset(snapshot);}
 private reset(snapshot:SnapshotEvent){this.entries=[...snapshot.entries];this.running=!!snapshot.run;this.partial=snapshot.generation?.message?structuredClone(snapshot.generation.message):undefined;this.lastError=undefined;}
 apply(event:AgentEvent):void{
  if(event.type==='snapshot'){this.reset(event);return;}
  if(event.type==='run_start'){this.running=true;this.lastError=undefined;}
  if(event.type==='run_end'){this.running=false;this.partial=undefined;}
  if(event.type==='entry_appended'||event.type==='message_end'){
   const index=this.entries.findIndex(e=>e.id===event.entry.id);if(index<0)this.entries.push(event.entry);else this.entries[index]=event.entry;
   if(event.type==='message_end')this.partial=undefined;
  }
  if(event.type==='message_start'&&event.message.role==='assistant')this.partial=structuredClone(event.message);
  if(event.type==='message_update'&&this.partial)for(const change of event.changes){
   if(change.type==='message')this.partial=structuredClone(change.message);
   else if(change.type==='text_delta'){const block=this.partial.content[change.contentIndex];if(block?.type==='text')block.text+=change.delta;}
   else if(change.type==='text_start'||change.type==='thinking_start'||change.type==='toolcall_start'||change.type==='block')this.partial.content[change.contentIndex]=structuredClone(change.block);
  }
  if(event.type==='task_failed')this.lastError='PROVIDER_FAILED';
 }
 view(blockedCode?:string):ChatView{
  let error=this.lastError;const all:DisplayEntry[]=[];
  for(const entry of this.entries){const message=entry.model?.find(m=>m.role==='user'||m.role==='assistant');if(!message||message.role!=='user'&&message.role!=='assistant')continue;
   if(message.role==='assistant'&&message.stopReason==='aborted')continue;
   if(message.role==='assistant'&&message.stopReason==='error')error=safeCode(message.errorMessage);
   all.push({id:String(entry.id),role:message.role,...clip(text(message)),...(message.role==='assistant'?{model:{providerId:message.provider,modelId:message.model}}:{})});
  }
  // An earlier failure does not label a later successfully completed answer as failed.
  const last=this.entries.flatMap(e=>e.model??[]).filter(m=>m.role==='assistant').at(-1);
  if(last?.role==='assistant'&&last.stopReason!=='error'&&!this.running)error=undefined;
  const view:ChatView={conversationId:this.id,entries:all.slice(-limits.entries),olderEntries:all.length>limits.entries,state:blockedCode?'blocked':this.running?'running':error?'failed':'idle'};
  if(blockedCode||!this.running&&error)view.errorCode=blockedCode??error;
  if(this.partial&&this.running)view.partial={id:'partial-'+this.id,...clip(text(this.partial))};
  while(view.entries.length&&Buffer.byteLength(JSON.stringify(view))>limits.viewBytes){view.entries.shift();view.olderEntries=true;}
  return view;
 }
}
