import {Type,type Static,type TSchema} from 'typebox';
import {Compile} from 'typebox/compile';
import {methods as v1Methods,viewSchema,settingsSchema,credentialSchema,byteCheck} from './schema.js';
const object=<T extends Record<string,TSchema>>(p:T,options={})=>Type.Object(p,{additionalProperties:false,...options});
const str=(max=128,min=1)=>Type.String({minLength:min,maxLength:max,'x-maxUtf8Bytes':max});
type LiteralTuple<T extends readonly string[]>={-readonly [K in keyof T]:Type.TLiteral<T[K]>};
const one=<const T extends readonly [string,...string[]]>(...v:T):Type.TUnion<LiteralTuple<T>>=>Type.Union(v.map(x=>Type.Literal(x))) as Type.TUnion<LiteralTuple<T>>;
const id=str(),bool=Type.Boolean(),time=Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER});
const path=Type.String({minLength:1,maxLength:4096,pattern:'^/[^\\x00]*$','x-maxUtf8Bytes':4096});
const hash=Type.String({pattern:'^[a-f0-9]{64}$',minLength:64,maxLength:64});
export const toolParameters={
 fs_read:object({path,maxBytes:Type.Optional(Type.Integer({minimum:1,maximum:65536}))}),
 fs_write:object({path,content:str(65536,0),expectedSha256:Type.Union([hash,Type.Null()])}),
 fs_patch:object({path,expectedSha256:hash,search:str(65536),replacement:str(65536,0)}),
 fs_move:object({from:path,to:path,expectedSha256:hash}),
 fs_mkdir:object({path}),
 service_inspect:object({scope:one('user','system'),unit:str(256)}),
 service_restart:object({unit:str(256)}),
 shell_run:object({script:str(16384),cwd:path,timeoutMs:Type.Optional(Type.Integer({minimum:1,maximum:60000}))})
} as const;
export type ToolName=keyof typeof toolParameters;
export const toolRequestSchema=Type.Union(Object.entries(toolParameters).map(([name,args])=>object({tool:Type.Literal(name),args},{'x-maxJsonBytes':195000}))) as TSchema;
// Explicit mapped union retains the tool/args relationship for adapter narrowing.
export type ToolRequest={[K in ToolName]:{tool:K;args:Static<(typeof toolParameters)[K]>}}[ToolName];
export type ToolCall={taskId:string;conversationId:string;callId:string;generationId:string};
export type ToolResult={isError:boolean;text:string;code?:string;truncated:boolean;stopRun?:boolean};
export const riskSchema=one('ordinary','high','unrestricted_shell');
export const operationSchema=object({id,conversationId:id,tool:one('fs_read','fs_write','fs_patch','fs_move','fs_mkdir','service_inspect','service_restart','shell_run'),fingerprint:id,risk:riskSchema,status:one('proposed','awaiting_approval','authorized','running','completed','failed','outcome_unknown','cancelled'),createdAt:time,startedAt:Type.Optional(time),finishedAt:Type.Optional(time),attempt:Type.Integer({minimum:0,maximum:16}),summary:str(512,0),targets:Type.Array(str(512,0),{maxItems:2}),output:str(4096,0),truncated:bool,errorCode:Type.Optional(id),approvalExpiresAt:Type.Optional(time),approvalId:Type.Optional(id)});
export type OperationView=Static<typeof operationSchema>;
export type OperationStatus=OperationView['status'];
export const decisionSchema=object({decisionId:id,operationId:id,fingerprint:id,decision:one('approve_once','deny')});
export type DecisionInput=Static<typeof decisionSchema>;
export const toolSnapshotSchema=object({revision:id,status:one('ready','waiting_for_approval','outcome_unknown','disabled','storage_failed'),operations:Type.Array(operationSchema,{maxItems:64}),olderOperations:bool},{'x-maxJsonBytes':98304});
export type ToolSnapshot=Static<typeof toolSnapshotSchema>;
export const workspaceSchema=object({chat:viewSchema,tools:toolSnapshotSchema},{'x-maxJsonBytes':524288});
export type WorkspaceView=Static<typeof workspaceSchema>;
export const approvalDetailsSchema=object({operationId:id,fingerprint:id,request:toolRequestSchema,risk:riskSchema,expiresAt:time},{'x-maxJsonBytes':196608});
export type ApprovalDetails={operationId:string;fingerprint:string;request:ToolRequest;risk:OperationView['risk'];expiresAt:number};
export const v2Methods={...v1Methods,
 'system.hello':{params:object({}),result:object({protocolVersion:Type.Literal(2),capabilities:object({tools:Type.Literal(true),codeMode:Type.Literal(false)}),settings:settingsSchema,credential:credentialSchema})},
 'conversation.get':{params:object({}),result:workspaceSchema},
 'conversation.subscribe':{params:object({}),result:object({epoch:id,subscriptionId:id,seq:Type.Literal('0'),view:workspaceSchema,settings:settingsSchema})},
 'tasks.list':{params:object({}),result:toolSnapshotSchema},
 'approvals.list':{params:object({}),result:object({revision:id,approvals:Type.Array(operationSchema,{maxItems:16})})},
 'approvals.get':{params:object({operationId:id,fingerprint:id}),result:approvalDetailsSchema},
 'approvals.decide':{params:decisionSchema,result:object({decisionId:id,operation:operationSchema})}
} as const;
const req=<K extends keyof typeof v2Methods,P extends TSchema>(method:K,params:P)=>object({v:Type.Literal(2),id,method:Type.Literal(method),params});
export const v2RequestSchema=Type.Union([req('system.hello',v2Methods['system.hello'].params),req('conversation.get',v2Methods['conversation.get'].params),req('conversation.subscribe',v2Methods['conversation.subscribe'].params),req('conversation.submit',v2Methods['conversation.submit'].params),req('conversation.cancel',v2Methods['conversation.cancel'].params),req('models.list',v2Methods['models.list'].params),req('settings.get',v2Methods['settings.get'].params),req('settings.update',v2Methods['settings.update'].params),req('credentials.store',v2Methods['credentials.store'].params),req('tasks.list',v2Methods['tasks.list'].params),req('approvals.list',v2Methods['approvals.list'].params),req('approvals.get',v2Methods['approvals.get'].params),req('approvals.decide',v2Methods['approvals.decide'].params)]);
const base={v:Type.Literal(2),epoch:id,subscriptionId:id,view:workspaceSchema};
export const v2ServerSchema=Type.Union([
 object({v:Type.Literal(2),id,epoch:id,ok:Type.Literal(true),result:Type.Union([v2Methods['system.hello'].result,v2Methods['conversation.get'].result,v2Methods['conversation.subscribe'].result,v2Methods['conversation.submit'].result,v2Methods['conversation.cancel'].result,v2Methods['models.list'].result,v2Methods['settings.get'].result,v2Methods['settings.update'].result,v2Methods['credentials.store'].result,v2Methods['tasks.list'].result,v2Methods['approvals.list'].result,v2Methods['approvals.get'].result,v2Methods['approvals.decide'].result])}),
 object({v:Type.Literal(2),id,epoch:id,ok:Type.Literal(false),error:object({code:id,message:str(512)})}),
 object({...base,event:Type.Literal('conversation.updated'),seq:Type.String({pattern:'^(0|[1-9][0-9]*)$',maxLength:64})}),
 object({...base,event:Type.Literal('conversation.snapshot'),seq:Type.Literal('0'),settings:settingsSchema})
]);
export type V2Request=Static<typeof v2RequestSchema>;
export type V2ServerFrame=Static<typeof v2ServerSchema>;
const requestCheck=Compile(v2RequestSchema),serverCheck=Compile(v2ServerSchema),toolCheck=Compile(toolRequestSchema);
export const validateV2Request=(v:unknown):v is V2Request=>requestCheck.Check(v)&&byteCheck(v2RequestSchema,v);
export const validateV2ServerFrame=(v:unknown):v is V2ServerFrame=>serverCheck.Check(v)&&byteCheck(v2ServerSchema,v);
export const validateToolRequest=(v:unknown):v is ToolRequest=>toolCheck.Check(v)&&byteCheck(toolRequestSchema,v);
