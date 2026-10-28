import{validateM3ToolRequest}from'@tilde/protocol';
import{monotonicNowMs}from'./native.js';
import type{ToolCall,ToolRequest,M3ToolRequest,M3ApprovalDetails,AdmittedLimits,ToolResult,OperationView,ApprovalDetails,DecisionInput,ToolSnapshot,ToolName}from'@tilde/protocol';
export type GuardedToolRequest=ToolRequest|M3ToolRequest;
export function normalizeToolRequest(request:GuardedToolRequest,policy?:AdmittedLimits):M3ToolRequest{
 const value=structuredClone(request);if(policy?.source!=='m3')return value;
 if(!validateM3ToolRequest(value))throw new ToolError('INVALID_TOOL_ARGUMENT');
 if(value.tool==='fs_read'&&value.args.maxBytes!==undefined&&value.args.maxBytes>policy.settings.fileReadBytes)throw new ToolError('CONTENT_TOO_LARGE');
 if(value.tool==='fs_write'&&Buffer.byteLength(value.args.content)>policy.settings.fileWriteBytes)throw new ToolError('CONTENT_TOO_LARGE');
 if(value.tool==='fs_patch'&&(Buffer.byteLength(value.args.search)>policy.settings.fileWriteBytes||Buffer.byteLength(value.args.replacement)>policy.settings.fileWriteBytes))throw new ToolError('CONTENT_TOO_LARGE');
 if(value.tool==='shell_run'){value.args.timeoutMs=value.args.timeoutMs===undefined?policy.settings.shellTimeoutMs:value.args.timeoutMs;const duration=value.args.timeoutMs;if(duration!==null&&(!Number.isSafeInteger(duration)||duration<1||duration>Number.MAX_SAFE_INTEGER-monotonicNowMs()-5000))throw new ToolError('INVALID_DURATION');}
 return value;
}
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type PreparedOperation={request:GuardedToolRequest;policy?:AdmittedLimits;execution?:{clock:'monotonic';deadline:number|null;durationMs:number|null};requestDigest:string;fingerprint:string;preconditions:Json;policyRevision:string;summary:string;targets:string[];highRisk?:boolean;diagnostic:boolean};
export type Receipt={result:ToolResult;observed:Json};
export type ExecutionIdentity={unitName:string;bootId?:string;invocationId?:string;cgroup?:string;pid?:number;startTicks?:string;clock?:'monotonic';startedMonotonicMs?:number;finishedMonotonicMs?:number;durationMs?:number|null;deadline?:number|null};
export type OperationRecord=OperationView&{timingPolicy?:'m3'|'legacy-m2'|null;payloadRetained?:boolean;policy?:AdmittedLimits;call:ToolCall;requestDigest:string;prepared?:PreparedOperation;receipt?:Receipt;approvalConsumed:boolean;decision?:DecisionInput;lastObservedAt:number;execution?:ExecutionIdentity;payloadPruned?:boolean;artifactBytes?:number;artifactsPruned?:boolean};
export type Reconciliation={kind:'completed'|'failed';receipt:Receipt}|{kind:'running'|'unknown'};
export type Adapter={prepare(request:GuardedToolRequest,policy?:AdmittedLimits):Promise<PreparedOperation>;dispatch(prepared:PreparedOperation,operationId:string,signal?:AbortSignal):Promise<Receipt>;reconcile(record:OperationRecord):Promise<Reconciliation>;artifacts?(record:OperationRecord,prune:boolean):Promise<number>;cancel?(record:OperationRecord):Promise<Reconciliation>;close?():Promise<void>};
export type AdapterRegistry=Partial<Record<ToolName,Adapter>>;
export type PolicyDecision={kind:'allow'|'approval'|'deny';risk:OperationView['risk'];reasonCode:string};
export interface ToolBroker{inspect():Promise<ToolSnapshot>;watchInspection(listener:(snapshot:ToolSnapshot)=>void):Promise<{snapshot:ToolSnapshot;stop():void}>;execute(call:ToolCall,request:GuardedToolRequest,signal?:AbortSignal,policy?:AdmittedLimits):Promise<ToolResult>;decide(input:DecisionInput,actorUid:number):Promise<OperationView>;details(id:string,fingerprint:string):Promise<ApprovalDetails|M3ApprovalDetails>;snapshot():Promise<ToolSnapshot>;watch(listener:(snapshot:ToolSnapshot)=>void):Promise<{snapshot:ToolSnapshot;stop():void}>;reserveGenerationRequest(id:string,limit:number):Promise<void>;reconcile():Promise<void>;cancel(conversationId:string):Promise<void>;close():Promise<void>}
export class ToolError extends Error{constructor(public readonly code:string){super(code);}}
export function safeCode(error:unknown):string{return error instanceof ToolError?error.code:'TOOL_FAILED';}
