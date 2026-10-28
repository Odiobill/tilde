import {Type,type Static,type TSchema} from 'typebox';
import {Compile} from 'typebox/compile';
import type {WorkLimits,PublicLimits,UiPreferences,PublicUiPreferences} from '@tilde/config';
import {methods as legacyMethods,settingsSchema,credentialSchema,receiptSchema,selectionSchema,byteCheck} from './schema.js';
import {toolParameters,operationSchema,decisionSchema,toolSnapshotSchema,approvalDetailsSchema,riskSchema,type ToolName} from './m2.js';
export type {WorkLimits,PublicLimits,UiPreferences,PublicUiPreferences};
const object=<T extends Record<string,TSchema>>(p:T,options={})=>Type.Object(p,{additionalProperties:false,...options});
const str=(max=128,min=1)=>Type.String({minLength:min,maxLength:max,'x-maxUtf8Bytes':max});
type Literals<T extends readonly string[]>={-readonly[K in keyof T]:Type.TLiteral<T[K]>};
const one=<const T extends readonly[string,...string[]]>(...v:T):Type.TUnion<Literals<T>>=>Type.Union(v.map(x=>Type.Literal(x))) as Type.TUnion<Literals<T>>;
const id=str(),piId=Type.String({minLength:1,maxLength:128,pattern:'^[1-9][0-9]*$','x-maxUtf8Bytes':128});
const count=Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER});
const positive=(max=Number.MAX_SAFE_INTEGER)=>Type.Integer({minimum:1,maximum:max});
const nullable=<T extends TSchema>(s:T)=>Type.Union([s,Type.Null()]);
const nullablePositive=Type.Union([positive(),Type.Null()]);
const bool=Type.Boolean(),cursor=str(2048),empty=object({});
const paged={conversationId:piId,cursor:Type.Optional(cursor)};
const owner={conversationId:piId};
const operationOwner={...owner,operationId:id,fingerprint:id};
const hash=Type.String({minLength:64,maxLength:64,pattern:'^[a-f0-9]{64}$'});
export const m3Envelopes={catalogRows:40,catalogBytes:65536,historyRows:32,historyBytes:196608,tailRows:128,tailBytes:262144,selectedBytes:786432,workBytes:131072,activityRows:32,activityBytes:196608,detailBytes:327680,previewBytes:32768,chunkBytes:32768,inputBytes:131072,contentBytes:8388608,aggregateBytes:67108864,cursorBytes:2048} as const;
export const workLimitsSchema=object({version:Type.Literal(1),providerRequests:nullablePositive,toolOperations:nullablePositive,providerTimeoutMs:positive(),outputTokens:positive(),modelOutputOverrides:Type.Array(object({providerId:id,modelId:str(256),outputTokens:positive()}),{maxItems:256,'x-uniqueModelPairs':true}),shellTimeoutMs:nullablePositive,inputBytes:positive(131072),fileReadBytes:positive(8388608),fileWriteBytes:positive(8388608),retainedOutputBytes:positive(8388608),modelOutputBytes:positive(8388608),retentionDays:nullablePositive,retentionBytes:nullablePositive});
export const publicLimitsSchema=object({settings:workLimitsSchema,revision:id,effectiveModel:Type.Optional(object({providerId:id,modelId:str(256),outputTokens:positive()})),retentionSource:one('legacy','configured','default')});
export const admittedLimitsSchema=object({version:Type.Literal(1),source:one('m3','legacy-m2'),revision:id,settings:workLimitsSchema,providerId:id,modelId:str(256),effectiveOutputTokens:positive()});
export type AdmittedLimits=Static<typeof admittedLimitsSchema>;
export const uiPreferencesSchema=object({version:Type.Literal(1),theme:one('system','light','dark'),trayEnabled:bool,hideOnClose:bool,notifyCompletion:bool,notifyAttention:bool});
export const publicUiPreferencesSchema=object({...uiPreferencesSchema.properties,revision:id});
export const budgetIdentitySchema=object({...owner,runId:piId,taskId:piId,kind:one('requests','tools')});
export type BudgetIdentity=Static<typeof budgetIdentitySchema>;
export const budgetPauseSchema=object({...budgetIdentitySchema.properties,revision:id,used:count,limit:positive(),createdAt:count});
export type BudgetPause=Static<typeof budgetPauseSchema>;
export const budgetGrantSchema=object({extensionId:id,...owner,runId:piId,expectedRevision:id,requestLimit:nullablePositive,toolLimit:nullablePositive});
export type BudgetGrant=Static<typeof budgetGrantSchema>;
export const runUsageSchema=Type.Union([object({runId:piId,revision:id,requests:count,tools:count,requestLimit:nullablePositive,toolLimit:nullablePositive}),Type.Null()]);
export type RunUsage=Static<typeof runUsageSchema>;
export const catalogQuerySchema=object({query:str(256,0),cursor:Type.Optional(cursor)});
export type CatalogQuery=Static<typeof catalogQuerySchema>;
export const conversationSummarySchema=object({id:piId,title:str(256),metadataRevision:id,createdAt:Type.Optional(count),lastActivityAt:Type.Optional(count)});
export type ConversationSummary=Static<typeof conversationSummarySchema>;
export const catalogPageSchema=object({revision:id,refreshing:bool,conversations:Type.Array(conversationSummarySchema,{maxItems:40}),next:Type.Optional(cursor)},{'x-maxJsonBytes':65536});
export type CatalogPage=Static<typeof catalogPageSchema>;
export const historyRowSchema=Type.Union([
 object({kind:Type.Literal('message'),id,entryId:piId,messageIndex:count,role:one('user','assistant'),text:str(32768,0),truncated:bool,model:Type.Optional(selectionSchema),generationTaskId:Type.Optional(piId),stopReason:Type.Optional(one('pending','stop','length','toolUse','error','aborted','deferred'))}),
 object({kind:Type.Literal('tool_anchor'),id,entryId:piId,callId:id,generationTaskId:Type.Optional(piId),operationId:Type.Optional(id),fingerprint:Type.Optional(id)})
]);
export type HistoryRow=Static<typeof historyRowSchema>;
export const historyPageSchema=object({...owner,rows:Type.Array(historyRowSchema,{maxItems:32}),next:Type.Optional(cursor)},{'x-maxJsonBytes':196608});
export type HistoryPage=Static<typeof historyPageSchema>;
export const sourceChunkSchema=object({...owner,entryId:piId,messageIndex:count,offset:count,text:str(32768,0),nextOffset:Type.Optional(count),truncated:bool});
export type SourceChunk=Static<typeof sourceChunkSchema>;
export const conversationSubmitSchema=object({...owner,requestId:id,text:str(131072),selectionRevision:id});
export type ConversationSubmit=Static<typeof conversationSubmitSchema>;
export const payloadManifestSchema=object({...owner,subjectId:id,payloadId:id,kind:one('request','output'),sha256:hash,bytes:count,chunkBytes:Type.Literal(32768)});
export type PayloadManifest=Static<typeof payloadManifestSchema>;
export const payloadChunkSchema=object({payloadId:id,offset:count,text:str(32768,0),nextOffset:Type.Optional(count)});
export type PayloadChunk=Static<typeof payloadChunkSchema>;
export const approvalManifestSchema=object({...operationOwner,payloadId:id,sha256:hash,bytes:positive(67108864),chunkBytes:Type.Literal(32768),expiresAt:count,risk:riskSchema});
export type ApprovalManifest=Static<typeof approvalManifestSchema>;
const availability=one('retained','pruned','unavailable');
export const activeTimeSchema=object({clock:Type.Literal('monotonic'),elapsedMs:count,sampledAtMs:count,durationMs:nullablePositive,running:bool});
export const m3OperationSchema=object({...operationSchema.properties,timingKind:Type.Optional(one('legacy-wall','active-unavailable')),activeTime:Type.Optional(activeTimeSchema)});
export type M3OperationView=Static<typeof m3OperationSchema>;
export const activityItemSchema=object({...m3OperationSchema.properties,runId:piId,toolTaskId:piId,callId:id,payload:availability});
export type ActivityItem=Static<typeof activityItemSchema>;
export const activityPageSchema=object({...owner,revision:id,operations:Type.Array(activityItemSchema,{maxItems:32}),next:Type.Optional(cursor)},{'x-maxJsonBytes':196608});
export type ActivityPage=Static<typeof activityPageSchema>;
export const activityDetailsSchema=object({...operationOwner,payload:availability,requestText:nullable(str(32768,0)),requestTruncated:bool,output:str(32768,0),outputTruncated:bool,requestManifest:Type.Optional(payloadManifestSchema),outputManifest:Type.Optional(payloadManifestSchema),operation:Type.Optional(m3OperationSchema)},{'x-maxJsonBytes':327680});
export type ActivityDetails=Static<typeof activityDetailsSchema>;
export const workStateSchema=object({revision:id,status:one('ready','running','waiting_for_approval','budget_paused','blocked','outcome_unknown','storage_failed','concurrent_recovery'),activeConversationId:Type.Optional(piId),activeRunId:Type.Optional(piId),budgetPause:Type.Optional(budgetPauseSchema),errorCode:Type.Optional(id),attention:Type.Array(operationSchema,{maxItems:16}),catalogStatus:one('ready','refreshing','unavailable'),desktopStatus:one('disabled','ready','unavailable','failed')},{'x-maxJsonBytes':131072});
export type WorkState=Static<typeof workStateSchema>;
export const conversationViewSchema=object({...owner,rows:Type.Array(historyRowSchema,{maxItems:128}),olderCursor:Type.Optional(cursor),state:one('idle','running','failed','blocked','budget_paused'),partial:Type.Optional(object({id,text:str(32768,0),truncated:bool,generationTaskId:Type.Optional(piId)})),errorCode:Type.Optional(id)},{'x-maxJsonBytes':262144});
export type ConversationView=Static<typeof conversationViewSchema>;
export const selectedViewSchema=object({chat:conversationViewSchema,activity:activityPageSchema,work:workStateSchema},{'x-maxJsonBytes':786432});
export type SelectedView=Static<typeof selectedViewSchema>;
export const toolPolicyInfoSchema=object({roots:Type.Array(str(4096),{maxItems:16}),policyRevision:id,retentionDays:nullablePositive,requestLimit:nullablePositive,toolLimit:nullablePositive,unrestrictedShell:Type.Literal(true)});
export type ToolPolicyInfo=Static<typeof toolPolicyInfoSchema>;
// Additive tool definitions: immutable M2 validation/normalization remains separate.
export const m3ToolParameters={...toolParameters,
 fs_read:object({...toolParameters.fs_read.properties,maxBytes:Type.Optional(positive(8388608))}),
 fs_write:object({...toolParameters.fs_write.properties,content:str(8388608,0)}),
 fs_patch:object({...toolParameters.fs_patch.properties,search:str(8388608),replacement:str(8388608,0)}),
 shell_run:object({...toolParameters.shell_run.properties,timeoutMs:Type.Optional(nullablePositive)})
} as const;
export type M3ToolRequest={[K in ToolName]:{tool:K;args:Static<(typeof m3ToolParameters)[K]>}}[ToolName];
export const m3ToolRequestSchema=Type.Union(Object.entries(m3ToolParameters).map(([name,args])=>object({tool:Type.Literal(name),args},{'x-maxJsonBytes':67108864}))) as TSchema;
export const m3ApprovalDetailsSchema=object({operationId:id,fingerprint:id,request:m3ToolRequestSchema,risk:riskSchema,expiresAt:count},{'x-maxJsonBytes':196608});
export type M3ApprovalDetails={operationId:string;fingerprint:string;request:M3ToolRequest;risk:Static<typeof riskSchema>;expiresAt:number};
export const v3Methods={
 ...legacyMethods,
 'system.hello':{params:empty,result:object({protocolVersion:Type.Literal(3),capabilities:object({tools:Type.Literal(true),codeMode:Type.Literal(false),history:Type.Literal(true),markdown:Type.Literal(true),tray:Type.Literal(true),notifications:Type.Literal(true)}),rootConversationId:piId,settings:settingsSchema,credential:credentialSchema,ui:publicUiPreferencesSchema,limits:publicLimitsSchema,work:workStateSchema})},
 'conversations.list':{params:catalogQuerySchema,result:catalogPageSchema},
 'conversations.subscribe':{params:catalogQuerySchema,result:object({epoch:id,subscriptionId:id,seq:Type.Literal('0'),page:catalogPageSchema,work:workStateSchema})},
 'conversations.create':{params:object({requestId:id}),result:object({conversation:conversationSummarySchema,deduplicated:bool})},
 'conversations.rename':{params:object({...owner,title:str(256),expectedRevision:id}),result:conversationSummarySchema},
 'conversation.get':{params:object(owner),result:selectedViewSchema},
 'conversation.subscribe':{params:object(owner),result:object({epoch:id,subscriptionId:id,seq:Type.Literal('0'),view:selectedViewSchema,settings:settingsSchema})},
 'conversation.history':{params:object(paged),result:historyPageSchema},
 'conversation.source':{params:object({...owner,entryId:piId,messageIndex:count,offset:count}),result:sourceChunkSchema},
 'conversation.submit':{params:conversationSubmitSchema,result:receiptSchema},
 'conversation.cancel':{params:object(owner),result:object({cancelled:bool})},
 'activity.list':{params:object(paged),result:activityPageSchema},
 'activity.get':{params:object(operationOwner),result:activityDetailsSchema},
 'activity.usage':{params:object({...owner,runId:piId}),result:object({usage:runUsageSchema})},
 'activity.chunk':{params:object({...owner,payloadId:id,offset:count}),result:payloadChunkSchema},
 'approvals.manifest':{params:object(operationOwner),result:approvalManifestSchema},
 'approvals.chunk':{params:object({...operationOwner,payloadId:id,offset:count}),result:payloadChunkSchema},
 'approvals.decide':{params:object({...decisionSchema.properties,...owner}),result:object({decisionId:id,operation:operationSchema})},
 'approvals.get':{params:object(operationOwner),result:m3ApprovalDetailsSchema},
 'approvals.list':{params:object(owner),result:object({revision:id,approvals:Type.Array(operationSchema,{maxItems:16})})},
 'tasks.list':{params:object(owner),result:toolSnapshotSchema},
 'tools.policy':{params:empty,result:toolPolicyInfoSchema},
 'limits.get':{params:empty,result:publicLimitsSchema},
 'limits.update':{params:object({expectedRevision:id,next:workLimitsSchema}),result:publicLimitsSchema},
 'budget.extend':{params:budgetGrantSchema,result:object({usage:runUsageSchema})},
 'ui.settings.get':{params:empty,result:publicUiPreferencesSchema},
 'ui.settings.update':{params:object({expectedRevision:id,next:uiPreferencesSchema}),result:publicUiPreferencesSchema}
} as const;
export type V3Method=keyof typeof v3Methods;
export type V3Request={[K in V3Method]:{v:3;id:string;method:K;params:Static<(typeof v3Methods)[K]['params']>}}[V3Method];
export const v3RequestSchema=Type.Union(Object.entries(v3Methods).map(([method,m])=>object({v:Type.Literal(3),id,method:Type.Literal(method),params:m.params})));
const sequence=Type.String({pattern:'^(0|[1-9][0-9]*)$',maxLength:64});
const base={v:Type.Literal(3),epoch:id,subscriptionId:id};
export const v3ServerSchema=Type.Union([
 object({v:Type.Literal(3),id,epoch:id,ok:Type.Literal(true),result:Type.Union(Object.values(v3Methods).map(m=>m.result))}),
 object({v:Type.Literal(3),id,epoch:id,ok:Type.Literal(false),error:object({code:id,message:str(512)})}),
 object({...base,event:Type.Literal('conversation.updated'),seq:sequence,view:selectedViewSchema}),
 object({...base,event:Type.Literal('conversation.snapshot'),seq:Type.Literal('0'),view:selectedViewSchema,settings:settingsSchema}),
 object({...base,event:Type.Literal('conversations.updated'),seq:sequence,page:catalogPageSchema,work:workStateSchema}),
 object({...base,event:Type.Literal('conversations.snapshot'),seq:Type.Literal('0'),page:catalogPageSchema,work:workStateSchema})
]);
type V3Result={[K in V3Method]:Static<(typeof v3Methods)[K]['result']>}[V3Method];
export type V3ServerFrame={v:3;id:string;epoch:string;ok:true;result:V3Result}|{v:3;id:string;epoch:string;ok:false;error:{code:string;message:string}}|({v:3;epoch:string;subscriptionId:string;seq:string}&({event:'conversation.updated';view:SelectedView}|{event:'conversation.snapshot';view:SelectedView;settings:Static<typeof settingsSchema>}|{event:'conversations.updated'|'conversations.snapshot';page:CatalogPage;work:WorkState}));
// Additional relational checks shared with generated native validation.
export function v3ExtraCheck(schema:TSchema,value:unknown):boolean{
 const s=schema as Record<string,unknown>;
 if(s['x-uniqueModelPairs']&&Array.isArray(value)){const keys=value.map(v=>JSON.stringify([v.providerId,v.modelId]));if(new Set(keys).size!==keys.length)return false;}
 if(Array.isArray(s.anyOf))return (s.anyOf as TSchema[]).some((s:TSchema)=>Compile(s).Check(value)&&byteCheck(s,value)&&v3ExtraCheck(s,value));
 if(s.type==='object'&&value&&typeof value==='object')return Object.entries(s.properties as Record<string,TSchema>).every(([k,s])=>!Object.hasOwn(value,k)||v3ExtraCheck(s,(value as Record<string,unknown>)[k]));
 if(s.type==='array'&&Array.isArray(value))return value.every(v=>v3ExtraCheck(s.items as TSchema,v));
 return true;
}
const requestCheck=Compile(v3RequestSchema),serverCheck=Compile(v3ServerSchema),toolCheck=Compile(m3ToolRequestSchema);
export const validateV3Request=(v:unknown):v is V3Request=>requestCheck.Check(v)&&byteCheck(v3RequestSchema,v)&&v3ExtraCheck(v3RequestSchema,v);
export const validateV3ServerFrame=(v:unknown):v is V3ServerFrame=>serverCheck.Check(v)&&byteCheck(v3ServerSchema,v)&&v3ExtraCheck(v3ServerSchema,v);
export const validateM3ToolRequest=(v:unknown):v is M3ToolRequest=>toolCheck.Check(v)&&byteCheck(m3ToolRequestSchema,v);
type Equivalent<A,B>=A extends B?B extends A?true:never:never;
const policyParity:Equivalent<WorkLimits,Static<typeof workLimitsSchema>>=true;
const uiParity:Equivalent<UiPreferences,Static<typeof uiPreferencesSchema>>=true;
void policyParity;void uiParity;
