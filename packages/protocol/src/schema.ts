import { Type, type Static, type TSchema } from 'typebox';
import { Compile } from 'typebox/compile';
import type { AppConfig,PublicSettings } from '@tilde/config';
export const limits={frame:1048576,queueBytes:4194304,queueFrames:128,inputBytes:16384,keyBytes:4096,textBytes:32768,viewBytes:262144,entries:128,handlers:32,clients:8,requests:128,rateWindowMs:10000,helloMs:5000} as const;
const object=<T extends Record<string,TSchema>>(properties:T,options={})=>Type.Object(properties,{additionalProperties:false,...options});
const str=(max=128,min=1)=>Type.String({minLength:min,maxLength:max,'x-maxUtf8Bytes':max});
const id=str();const bool=Type.Boolean();const empty=object({});
const sequence=Type.String({pattern:'^(0|[1-9][0-9]*)$',maxLength:64});
export const configSchema=object({version:Type.Literal(1),providerId:Type.Literal('opencode-go'),modelId:str(256),authFile:Type.String({pattern:'^/',maxLength:4096,'x-maxUtf8Bytes':4096})});
export const settingsSchema=object({...configSchema.properties,selectionRevision:id,store:Type.Union([Type.Literal('shared'),Type.Literal('separate')])});
export const selectionSchema=object({providerId:id,modelId:str(256)});
export const displayEntrySchema=object({id,role:Type.Union([Type.Literal('user'),Type.Literal('assistant')]),text:str(limits.textBytes,0),truncated:bool,model:Type.Optional(selectionSchema)});
export const viewSchema=object({conversationId:id,entries:Type.Array(displayEntrySchema,{maxItems:limits.entries}),olderEntries:bool,state:Type.Union([Type.Literal('idle'),Type.Literal('running'),Type.Literal('failed'),Type.Literal('blocked')]),partial:Type.Optional(object({id,text:str(limits.textBytes,0),truncated:bool})),errorCode:Type.Optional(id)},{'x-maxJsonBytes':limits.viewBytes});
export const submitSchema=object({requestId:id,text:str(limits.inputBytes),selectionRevision:id});
export const receiptSchema=object({submissionId:id,deduplicated:bool});
export const credentialSchema=object({providerId:id,credentialStored:bool,store:Type.Union([Type.Literal('shared'),Type.Literal('separate')]),errorCode:Type.Optional(id)});
export const modelSchema=object({...selectionSchema.properties,name:str(256),credentialStored:bool});
export const methods={
 'system.hello':{params:empty,result:object({protocolVersion:Type.Literal(1),capabilities:object({tools:Type.Literal(false),codeMode:Type.Literal(false)}),settings:settingsSchema,credential:credentialSchema})},
 'conversation.get':{params:empty,result:viewSchema},
 'conversation.subscribe':{params:empty,result:object({epoch:id,subscriptionId:id,seq:Type.Literal('0'),view:viewSchema,settings:settingsSchema})},
 'conversation.submit':{params:submitSchema,result:receiptSchema},
 'conversation.cancel':{params:empty,result:object({cancelled:bool})},
 'models.list':{params:empty,result:object({models:Type.Array(modelSchema,{maxItems:256})})},
 'settings.get':{params:empty,result:settingsSchema},
 'settings.update':{params:object({expectedRevision:id,next:configSchema}),result:settingsSchema},
 'credentials.store':{params:object({expectedSelectionRevision:id,providerId:Type.Literal('opencode-go'),key:str(limits.keyBytes)}),result:credentialSchema}
} as const;
function request<const K extends keyof typeof methods,const P extends TSchema>(method:K,params:P){return object({v:Type.Literal(1),id,method:Type.Literal(method),params});}
export const requestSchema=Type.Union([request('system.hello',methods['system.hello'].params),request('conversation.get',methods['conversation.get'].params),request('conversation.subscribe',methods['conversation.subscribe'].params),request('conversation.submit',methods['conversation.submit'].params),request('conversation.cancel',methods['conversation.cancel'].params),request('models.list',methods['models.list'].params),request('settings.get',methods['settings.get'].params),request('settings.update',methods['settings.update'].params),request('credentials.store',methods['credentials.store'].params)]);
const eventBase={v:Type.Literal(1),epoch:id,subscriptionId:id,view:viewSchema};
export const serverSchema=Type.Union([
 object({v:Type.Literal(1),id,epoch:id,ok:Type.Literal(true),result:Type.Union([methods['system.hello'].result,methods['conversation.get'].result,methods['conversation.subscribe'].result,methods['conversation.submit'].result,methods['conversation.cancel'].result,methods['models.list'].result,methods['settings.get'].result,methods['credentials.store'].result])}),
 object({v:Type.Literal(1),id,epoch:id,ok:Type.Literal(false),error:object({code:id,message:str(512)})}),
 object({...eventBase,event:Type.Literal('conversation.updated'),seq:sequence}),
 object({...eventBase,event:Type.Literal('conversation.snapshot'),seq:Type.Literal('0'),settings:settingsSchema})
]);
export type Selection=Static<typeof selectionSchema>;
export type DisplayEntry=Static<typeof displayEntrySchema>;
export type ChatView=Static<typeof viewSchema>;
export type SubmitInput=Static<typeof submitSchema>;
export type SubmitReceipt=Static<typeof receiptSchema>;
export type CredentialStatus=Static<typeof credentialSchema>;
export type ModelSummary=Static<typeof modelSchema>;
export type Request=Static<typeof requestSchema>;
export type ServerFrame=Static<typeof serverSchema>;
export type Frame=Request|ServerFrame;
type Equivalent<A,B>=A extends B?B extends A?true:never:never;
const configParity:Equivalent<AppConfig,Static<typeof configSchema>>=true;
const settingsParity:Equivalent<PublicSettings,Static<typeof settingsSchema>>=true;
void configParity;void settingsParity;
const requestCheck=Compile(requestSchema),serverCheck=Compile(serverSchema);
// JSON Schema bounds code points; protocol bounds UTF-8 and serialized view bytes too.
export function byteCheck(schema:TSchema,value:unknown):boolean {
 const s=schema as Record<string,unknown>;
 if(typeof value==='string'&&typeof s['x-maxUtf8Bytes']==='number'&&Buffer.byteLength(value)>s['x-maxUtf8Bytes'])return false;
 if(typeof s['x-maxJsonBytes']==='number'&&Buffer.byteLength(JSON.stringify(value))>s['x-maxJsonBytes'])return false;
 if(Array.isArray(s.anyOf))return (s.anyOf as TSchema[]).some(branch=>Compile(branch).Check(value)&&byteCheck(branch,value));
 if(s.type==='object'&&value&&typeof value==='object')return Object.entries(s.properties as Record<string,TSchema>).every(([k,v])=>!(k in value)||byteCheck(v,(value as Record<string,unknown>)[k]));
 if(s.type==='array'&&Array.isArray(value))return value.every(v=>byteCheck(s.items as TSchema,v));
 return true;
}
export const validateRequest=(value:unknown):value is Request=>requestCheck.Check(value)&&byteCheck(requestSchema,value);
export const validateServerFrame=(value:unknown):value is ServerFrame=>serverCheck.Check(value)&&byteCheck(serverSchema,value);
