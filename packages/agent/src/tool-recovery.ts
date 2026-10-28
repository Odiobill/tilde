import{defineDoc,type ToolExecutionApi,type TaskId,GenerationTask,LiveDoc,ToolTask,type Harness}from'@earendil-works/pi-durable';import type{Context}from'@earendil-works/chord/context';import type{AppConfig}from'@tilde/config';
export const RunSettings=defineDoc<{config:AppConfig;toolNames?:string[];toolPolicyRevision?:string}>({scope:'session',kind:'tilde.run-settings',version:1,checkpointWhen:()=>true,initial:()=>({config:{version:1,providerId:'opencode-go',modelId:'deepseek-v4.1-flash',authFile:'/unconfigured'}})});
export async function generationOwner(api:Pick<ToolExecutionApi,'taskId'|'conversationId'|'getTask'>,context:Context):Promise<string>{let id=api.taskId;const seen=new Set<string>();for(let i=0;i<64;i++){if(seen.has(String(id)))break;seen.add(String(id));const record=await api.getTask(id,context);if(!record||record.conversationId!==api.conversationId)break;if(record.kind===GenerationTask.definition.name)return String(record.id);if(!record.owner)break;id=record.owner;}throw new Error('GENERATION_IDENTITY_FAILED');}

export async function generationBudgetKey(api:ToolExecutionApi,context:Context):Promise<string>{const generation=await generationOwner(api,context);const live=await api.snapshot(LiveDoc,api.conversationId,context);if(String(live?.run?.taskId)!==generation||!live?.run?.inputs[0])throw new Error('GENERATION_IDENTITY_FAILED');return String(live.run.inputs[0]);}

export async function retryGuardedDecision(h:Pick<Harness,'inspect'|'retryTask'>,binding:{call:import('@tilde/protocol').ToolCall;operation:import('@tilde/protocol').OperationView},context:Context):Promise<void>{const{call,operation}=binding;if(operation.status!=='authorized'&&!(operation.status==='failed'&&operation.errorCode==='APPROVAL_DENIED'))return;const inspection=await h.inspect(context);const parked=inspection.tasks.find(t=>String(t.record.id)===call.taskId);if(!parked||parked.state.kind!=='blocked'||parked.state.reason!=='restart_limit'||parked.record.kind!==ToolTask.definition.name||String(parked.record.conversationId)!==call.conversationId||parked.record.abortRequested)return;const input=parked.record.input as {callId?:string};if(input.callId!==call.callId)return;await h.retryTask(parked.record.id,context);}

// A count grant can only retry the exact public task retained at the budget gate.
export async function retryBudgetPause(h:Pick<Harness,'inspect'|'retryTask'|'snapshot'|'getTask'>,pause:import('@tilde/protocol').BudgetPause,context:Context):Promise<void>{
 const inspection=await h.inspect(context);const parked=inspection.tasks.find(t=>String(t.record.id)===pause.taskId);
 if(!parked||parked.state.kind!=='blocked'||parked.state.reason!=='restart_limit'||String(parked.record.conversationId)!==pause.conversationId||parked.record.abortRequested)return;
 const expected=pause.kind==='requests'?GenerationTask.definition.name:ToolTask.definition.name;if(parked.record.kind!==expected)return;
 const live=await h.snapshot(LiveDoc,parked.record.conversationId,context);if(String(live?.run?.inputs[0])!==pause.runId)return;
 if(pause.kind==='requests'){if(live?.run?.taskId!==parked.record.id)return;}else{const generation=await generationOwner({taskId:parked.record.id,conversationId:parked.record.conversationId,getTask:(id,c)=>h.getTask(id,c)},context);if(generation!==String(live?.run?.taskId))return;}
 await h.retryTask(parked.record.id,context);
}
