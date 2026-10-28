import{GenerationTask,ToolTask,type Harness,type EntryRecord,type TaskId}from'@earendil-works/pi-durable';import type{Context}from'@earendil-works/chord/context';import type{OperationRecord}from'@tilde/tools';import{publicPiId}from'./history.js';
// Bounded candidates are only hints. Every inline association is proved again
// against the public ToolTask input, immutable assistant entry and task ancestry.
export async function verifiedToolAnchor(h:Pick<Harness,'getTask'>,entry:EntryRecord,callId:string,candidates:readonly OperationRecord[],context:Context):Promise<{generationTaskId:string;operationId:string;fingerprint:string}|undefined>{
 if(!entry.byTaskId||candidates.length>=32)return;let match:{generationTaskId:string;operationId:string;fingerprint:string}|undefined;
 for(const c of candidates){if(c.conversationId!==String(entry.conversationId)||c.call.conversationId!==c.conversationId||c.call.callId!==callId||!entry.model?.some(m=>m.role==='assistant'&&m.content.some(b=>b.type==='toolCall'&&b.id===callId&&b.name===c.tool)))continue;let id:TaskId;try{id=publicPiId(c.call.taskId) as TaskId;}catch{continue;}const tool=await h.getTask(id,context);if(!tool||tool.kind!==ToolTask.definition.name||tool.conversationId!==entry.conversationId)continue;const input=tool.input as {kind?:unknown;assistant?:unknown;callId?:unknown}|null;if(!input||input.kind!=='model'||input.assistant!==entry.id||input.callId!==callId)continue;
  let owner=tool.owner;const seen=new Set<number>();for(let i=0;i<64&&owner!==undefined;i++){if(seen.has(owner))break;seen.add(owner);const task=await h.getTask(owner,context);if(!task||task.conversationId!==entry.conversationId)break;if(task.kind===GenerationTask.definition.name){if(task.id===entry.byTaskId){if(match)return;match={generationTaskId:String(task.id),operationId:c.id,fingerprint:c.fingerprint};}break;}owner=task.owner;}
 }
 return match;
}
