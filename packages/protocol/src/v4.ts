import {Type,type Static,type TSchema} from 'typebox';
import {Compile} from 'typebox/compile';
import {checkDefinition,ConfigError,type ConnectionDefinition} from '@tilde/config';
import {byteCheck} from './schema.js';
import {v3Methods,v3ExtraCheck,selectedViewSchema,catalogPageSchema,workStateSchema} from './m3.js';
const object=<T extends Record<string,TSchema>>(p:T,options={})=>Type.Object(p,{additionalProperties:false,...options});
const str=(max=128,min=1)=>Type.String({minLength:min,maxLength:max,'x-maxUtf8Bytes':max});
type Literals<T extends readonly string[]>={-readonly[K in keyof T]:Type.TLiteral<T[K]>};
const one=<const T extends readonly [string,...string[]]>(...v:T):Type.TUnion<Literals<T>>=>Type.Union(v.map(x=>Type.Literal(x))) as Type.TUnion<Literals<T>>;
const id=str(),hash=Type.String({minLength:64,maxLength:64,pattern:'^[a-f0-9]{64}$'}),bool=Type.Boolean(),empty=object({});
const provider=Type.String({minLength:1,maxLength:128,pattern:'^(?!(?:constructor|prototype|__proto__)$)[A-Za-z0-9][A-Za-z0-9_.-]*$','x-maxUtf8Bytes':128});
const path=Type.String({minLength:1,maxLength:4096,pattern:'^/[^\\x00]*$','x-maxUtf8Bytes':4096});
const nonnegative=(max=Number.MAX_SAFE_INTEGER)=>Type.Integer({minimum:0,maximum:max});
const positive=(max=Number.MAX_SAFE_INTEGER)=>Type.Integer({minimum:1,maximum:max});
const nullable=<T extends TSchema>(s:T)=>Type.Union([s,Type.Null()]);
const seq=Type.String({minLength:1,maxLength:64,pattern:'^(0|[1-9][0-9]*)$'});
export const v4Bounds={pageRows:40,pageBytes:65536,stateBytes:65536,promptOptions:32,messageBytes:16384,responseBytes:65536,sessionMs:900000,refreshMs:60000,registryBytes:1048576} as const;
export const definitionRefSchema=object({connectionId:id,definitionRevision:hash});
export const authTargetSchema=object({...definitionRefSchema.properties,providerId:provider,authFile:path});
export const targetFenceSchema=object({expectedSelectionRevision:id,expectedRegistryRevision:id,expectedDefinitionRevision:nullable(hash),expectedAuthGeneration:nullable(id)});
export const selectionV2Schema=object({version:Type.Literal(2),...authTargetSchema.properties,modelId:str(256)});
export const publicSelectionV2Schema=object({...selectionV2Schema.properties,selectionRevision:id,store:one('shared','separate')});
const modelDefinition=object({id:str(256),name:str(256),contextWindow:positive(),maxTokens:positive(),reasoning:bool});
const options=Type.Union([object({kind:Type.Literal('none')}),object({kind:Type.Literal('azure'),baseUrl:Type.Optional(str(4096)),resourceName:Type.Optional(str(256)),apiVersion:Type.Optional(str(256)),deployments:Type.Optional(Type.Array(object({modelId:str(256),deployment:str(256)}),{maxItems:128}))}),object({kind:Type.Literal('bedrock'),region:Type.Optional(str(128))})]);
// Wire uses bounded arrays for mapping data; storage converts deployments to a dictionary.
const auth=Type.Union([object({mode:one('pi','none','api-key')}),object({mode:Type.Literal('environment'),envKey:Type.String({minLength:1,maxLength:128,pattern:'^[A-Za-z_][A-Za-z0-9_]*$'})})]);
const headerName=Type.String({minLength:1,maxLength:128,pattern:"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$"});
const header=Type.Union([object({name:headerName,value:str(4096,0)}),object({name:headerName,secretRef:Type.String({minLength:1,maxLength:128,pattern:'^[A-Za-z_][A-Za-z0-9_]*$'})})]);
const compat=object({supportsStore:Type.Optional(bool),supportsDeveloperRole:Type.Optional(bool),supportsReasoningEffort:Type.Optional(bool),supportsUsageInStreaming:Type.Optional(bool),supportsFinishReason:Type.Optional(bool),requiresToolResultName:Type.Optional(bool),requiresAssistantAfterToolResult:Type.Optional(bool),requiresThinkingAsText:Type.Optional(bool),requiresReasoningContentOnAssistantMessages:Type.Optional(bool),supportsThinkingTokenBudget:Type.Optional(bool),supportsOpenAIGrammarTools:Type.Optional(bool),supportsMidConvoSystemMessages:Type.Optional(bool),supportsMidConvoToolAdditions:Type.Optional(bool),supportsStrictMode:Type.Optional(bool),sendSessionAffinityHeaders:Type.Optional(bool),supportsLongCacheRetention:Type.Optional(bool),supportsAdditionalTools:Type.Optional(bool),supportsToolSearch:Type.Optional(bool),supportsExplicitPromptCacheMode:Type.Optional(bool),supportsMidConvoEffort:Type.Optional(bool),supportsMaxOutputTokens:Type.Optional(bool),maxTokensField:Type.Optional(one('max_tokens','max_completion_tokens')),sessionAffinityFormat:Type.Optional(one('openai','openai-nosession','openrouter'))});
export const connectionDefinitionSchema=object({version:Type.Literal(1),connectionId:id,providerId:provider,kind:one('builtin','openai-compatible'),displayName:str(256),options,auth,headers:Type.Array(header,{maxItems:32}),models:Type.Array(modelDefinition,{maxItems:128}),baseUrl:Type.Optional(str(4096)),api:Type.Optional(one('openai-completions','openai-responses')),compat:Type.Optional(compat)},{'x-maxJsonBytes':1048576});
export const authMethodSchema=object({type:one('api_key','oauth'),name:str(256),canLogin:bool,loginLabel:Type.Optional(str(256)),isSubscription:Type.Optional(bool)});
export const authStatusSchema=object({target:authTargetSchema,authGeneration:id,status:one('not_configured','stored_api_key','signed_in','refresh_needed','environment','profile','keyless','missing_configuration','store_unavailable','store_busy','setup','sign_in_required','not_checked'),configured:bool,credentialStored:bool,credentialType:Type.Optional(one('api_key','oauth')),methods:Type.Array(authMethodSchema,{maxItems:2}),source:Type.Optional(str(512)),errorCode:Type.Optional(id)});
export const providerRowSchema=object({...definitionRefSchema.properties,providerId:provider,kind:one('builtin','openai-compatible'),name:str(256),disabled:bool,methods:Type.Array(authMethodSchema,{maxItems:2}),status:Type.Optional(authStatusSchema)});
export const providerPageSchema=object({revision:id,providers:Type.Array(providerRowSchema,{maxItems:40}),next:Type.Optional(str(2048))},{'x-maxJsonBytes':65536});
export const modelMetaSchema=object({providerId:provider,modelId:str(256),name:str(256),api:id,contextWindow:positive(),maxTokens:positive(),reasoning:bool});
export const modelPageSchema=object({revision:id,models:Type.Array(modelMetaSchema,{maxItems:40}),next:Type.Optional(str(2048)),stale:Type.Optional(bool),errorCode:Type.Optional(id)},{'x-maxJsonBytes':65536});
export const admissionStatusSchema=object({canSubmit:bool,blockedBy:one('none','auth','catalog'),operationId:Type.Optional(id)});
const piId=Type.String({minLength:1,maxLength:128,pattern:'^[1-9][0-9]*$'});
export const authRecoveryViewSchema=object({reason:id,owner:object({conversationId:piId,runId:piId,taskId:piId,expectedWorkRevision:id,target:authTargetSchema})});
export const runtimeSettingsSchema=object({selection:publicSelectionV2Schema,selectedModel:nullable(modelMetaSchema),credential:nullable(authStatusSchema),admission:admissionStatusSchema,registryRevision:id,authRecovery:Type.Optional(authRecoveryViewSchema)});
const promptFields={id,type:one('text','secret','manual_code'),message:str(16384),placeholder:Type.Optional(str(1024))};
export const authPromptSchema=Type.Union([object(promptFields),object({id,type:Type.Literal('select'),message:str(16384),options:Type.Array(object({id,label:str(256),description:Type.Optional(str(1024))}),{maxItems:32})})]);
const link=object({url:str(16384),label:Type.Optional(str(256))});
export const authEventSchema=Type.Union([object({type:Type.Literal('info'),message:str(16384),links:Type.Optional(Type.Array(link,{maxItems:8}))}),object({type:Type.Literal('auth_url'),url:str(16384),instructions:Type.Optional(str(16384))}),object({type:Type.Literal('device_code'),userCode:str(4096),verificationUri:str(16384),intervalSeconds:Type.Optional(positive(900)),expiresInSeconds:Type.Optional(positive(900))}),object({type:Type.Literal('progress'),message:str(16384)})]);
export const authSessionSchema=object({sessionId:id,operationId:id,ownerId:id,target:authTargetSchema,seq,state:one('starting','waiting','progress','committing','succeeded','failed','cancelled','expired'),expiresInMs:nonnegative(900000),prompt:Type.Optional(authPromptSchema),event:Type.Optional(authEventSchema),errorCode:Type.Optional(id)},{'x-maxJsonBytes':65536});
export const catalogRefreshSchema=object({operationId:id,ownerId:id,target:authTargetSchema,state:one('running','succeeded','failed','cancelled'),remainingMs:nonnegative(60000),errorCode:Type.Optional(id)});

export const resumeAuthIntentSchema=object({intentId:id,conversationId:piId,runId:piId,taskId:piId,expectedWorkRevision:id});
export const resumeAuthResultSchema=object({intent:resumeAuthIntentSchema,outcome:one('accepted','reconciled','refused'),errorCode:Type.Optional(id)});
const query={query:str(256,0),cursor:Type.Optional(str(2048))};
const mutation={target:authTargetSchema,fence:targetFenceSchema};
const published=object({definition:connectionDefinitionSchema,...definitionRefSchema.properties,registryRevision:id});
const {'models.list':_models,'settings.get':_get,'settings.update':_update,'credentials.store':_store,...inherited}=v3Methods;
export const v4Methods={...inherited,
 'system.hello':{params:empty,result:object({protocolVersion:Type.Literal(4),clientId:id,capabilities:v3Methods['system.hello'].result.properties.capabilities,rootConversationId:piId,settings:runtimeSettingsSchema,ui:v3Methods['ui.settings.get'].result,limits:v3Methods['limits.get'].result,work:workStateSchema})},
 'conversation.subscribe':{params:v3Methods['conversation.subscribe'].params,result:object({epoch:id,subscriptionId:id,seq:Type.Literal('0'),view:selectedViewSchema,settings:runtimeSettingsSchema})},
 'providers.list':{params:object(query),result:providerPageSchema},
 'providers.get':{params:definitionRefSchema,result:published},
 'providers.save':{params:object({fence:targetFenceSchema,definition:connectionDefinitionSchema}),result:published},
 'providers.remove':{params:object(mutation),result:providerPageSchema},
 'models.list':{params:object({target:authTargetSchema,...query}),result:modelPageSchema},
 'models.refresh':{params:object({operationId:id,...mutation}),result:catalogRefreshSchema},
 'models.refresh.cancel':{params:object({operationId:id}),result:catalogRefreshSchema},
 'models.refresh.status':{params:object({operationId:id}),result:catalogRefreshSchema},
 'settings.get':{params:empty,result:runtimeSettingsSchema},
 'settings.update':{params:object({fence:targetFenceSchema,next:selectionV2Schema}),result:runtimeSettingsSchema},
 'credentials.status':{params:object({target:authTargetSchema}),result:authStatusSchema},
 'credentials.remove':{params:object(mutation),result:authStatusSchema},
 'auth.start':{params:object({operationId:id,...mutation,method:one('api_key','oauth')}),result:authSessionSchema},
 'auth.respond':{params:object({sessionId:id,promptId:id,seq,value:str(65536,0)}),result:authSessionSchema},
 'auth.cancel':{params:object({sessionId:id}),result:authSessionSchema},
 'auth.status':{params:object({sessionId:id}),result:authSessionSchema},
 'conversation.resume':{params:object({intent:resumeAuthIntentSchema}),result:resumeAuthResultSchema}
} as const;
export type V4Method=keyof typeof v4Methods;
export type V4Request={[K in V4Method]:{v:4;id:string;method:K;params:Static<(typeof v4Methods)[K]['params']>}}[V4Method];
export const v4RequestSchema=Type.Union(Object.entries(v4Methods).map(([method,m])=>object({v:Type.Literal(4),id,method:Type.Literal(method),params:m.params})));
const eventBase={v:Type.Literal(4),epoch:id};
export const v4ServerSchema=Type.Union([
 object({...eventBase,id,ok:Type.Literal(true),result:Type.Union(Object.values(v4Methods).map(m=>m.result))}),object({...eventBase,id,ok:Type.Literal(false),error:object({code:id,message:str(512)})}),
 object({...eventBase,subscriptionId:id,event:Type.Literal('conversation.updated'),seq,view:selectedViewSchema}),object({...eventBase,subscriptionId:id,event:Type.Literal('conversation.snapshot'),seq:Type.Literal('0'),view:selectedViewSchema,settings:runtimeSettingsSchema}),
 object({...eventBase,subscriptionId:id,event:one('conversations.updated','conversations.snapshot'),seq,page:catalogPageSchema,work:workStateSchema}),
 object({...eventBase,event:Type.Literal('auth.updated'),session:authSessionSchema}),object({...eventBase,event:Type.Literal('models.refresh.updated'),refresh:catalogRefreshSchema})
]);
export type V4Result={[K in V4Method]:Static<(typeof v4Methods)[K]['result']>}[V4Method];
export type V4ServerFrame=Exclude<Static<typeof v4ServerSchema>,{ok:true}>|{v:4;id:string;epoch:string;ok:true;result:V4Result};
export type AuthTarget=Static<typeof authTargetSchema>;
export type TargetFence=Static<typeof targetFenceSchema>;
export type AuthMethod=Static<typeof authMethodSchema>;
export type AuthStatus=Static<typeof authStatusSchema>;
export type AuthPrompt=Static<typeof authPromptSchema>;
export type AuthEvent=Static<typeof authEventSchema>;
export type AuthSessionView=Static<typeof authSessionSchema>;
export type CatalogRefreshView=Static<typeof catalogRefreshSchema>;
export type ProviderPage=Static<typeof providerPageSchema>;
export type ProviderRow=Static<typeof providerRowSchema>;
export type ModelPage=Static<typeof modelPageSchema>;
export type ModelMeta=Static<typeof modelMetaSchema>;
export type RuntimeSettings=Static<typeof runtimeSettingsSchema>;
export type ResumeAuthIntent=Static<typeof resumeAuthIntentSchema>;
export type ResumeAuthResult=Static<typeof resumeAuthResultSchema>;
export type AuthOwner={epoch:string;clientId:string};
const req=Compile(v4RequestSchema),server=Compile(v4ServerSchema);
// Historical byte/relational helpers compile union branches on each call. Keep their
// frozen bytes intact; v4 caches the same branch checks and visits bounds once.
const branches=new WeakMap<TSchema,ReturnType<typeof Compile>>();
function bounded(schema:TSchema,value:unknown):boolean{const s=schema as Record<string,unknown>;if(typeof value==='string'&&typeof s['x-maxUtf8Bytes']==='number'&&Buffer.byteLength(value)>s['x-maxUtf8Bytes'])return false;if(typeof s['x-maxJsonBytes']==='number'&&Buffer.byteLength(JSON.stringify(value))>s['x-maxJsonBytes'])return false;if(s['x-uniqueModelPairs']&&Array.isArray(value)&&new Set(value.map(v=>JSON.stringify([v.providerId,v.modelId]))).size!==value.length)return false;if(Array.isArray(s.anyOf))return(s.anyOf as TSchema[]).some(branch=>{let check=branches.get(branch);if(!check){check=Compile(branch);branches.set(branch,check);}return check.Check(value)&&bounded(branch,value);});if(s.type==='object'&&value&&typeof value==='object')return Object.entries(s.properties as Record<string,TSchema>).every(([k,child])=>!Object.hasOwn(value,k)||bounded(child,(value as Record<string,unknown>)[k]));if(s.type==='array'&&Array.isArray(value))return value.every(v=>bounded(s.items as TSchema,v));return true;}
export const validateV4Request=(v:unknown):v is V4Request=>req.Check(v)&&bounded(v4RequestSchema,v);
export const validateV4ServerFrame=(v:unknown):v is V4ServerFrame=>server.Check(v)&&bounded(v4ServerSchema,v);

export type WireConnectionDefinition=Static<typeof connectionDefinitionSchema>;
const definitionCheck=Compile(connectionDefinitionSchema);
export function toWireDefinition(input:unknown):WireConnectionDefinition{
 const def=checkDefinition(input);const options:Record<string,unknown>={...def.options};if(def.options.kind==='azure'&&def.options.deployments)options.deployments=Object.entries(def.options.deployments).map(([modelId,deployment])=>({modelId,deployment}));const wire:unknown={...def,options};if(!definitionCheck.Check(wire)||!byteCheck(connectionDefinitionSchema,wire))throw new ConfigError('INVALID_PROVIDER_CONFIG');return wire;
}
export function fromWireDefinition(wire:unknown):ConnectionDefinition{
 if(!definitionCheck.Check(wire)||!byteCheck(connectionDefinitionSchema,wire))throw new ConfigError('INVALID_PROVIDER_CONFIG');const options:Record<string,unknown>={...wire.options};if(wire.options.kind==='azure'&&wire.options.deployments){const rows=wire.options.deployments;if(new Set(rows.map(x=>x.modelId)).size!==rows.length)throw new ConfigError('INVALID_PROVIDER_CONFIG');options.deployments=Object.fromEntries(rows.map(x=>[x.modelId,x.deployment]));}return checkDefinition({...wire,options});
}
