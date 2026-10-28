import{defineDoc,type DocumentReader,type ConversationId}from'@earendil-works/pi-durable';
import type{Context}from'@earendil-works/chord/context';
import{loadWorkLimits,resolveOutputTokens,ConfigError,type RuntimePaths,type AppConfig,type WorkLimits}from'@tilde/config';
import type{AdmittedLimits}from'@tilde/protocol';
import{RunSettings}from'./tool-recovery.js';
export const ExecutionPolicyDoc=defineDoc<{admissionRequestId:string;limits:AdmittedLimits|null}>({scope:'conversation',history:'latest',fork:'initial',kind:'tilde.execution-policy',version:1,checkpointWhen:()=>true,initial:()=>({admissionRequestId:'',limits:null})});
export function legacyAdmittedLimits(config:{providerId:string;modelId:string}):AdmittedLimits{
 const effectiveOutputTokens=config.providerId==='opencode-go'&&config.modelId==='deepseek-v4.1-flash'?8192:2048;
 const settings:WorkLimits={version:1,providerRequests:8,toolOperations:16,providerTimeoutMs:60000,outputTokens:effectiveOutputTokens,modelOutputOverrides:[],shellTimeoutMs:30000,inputBytes:16384,fileReadBytes:65536,fileWriteBytes:65536,retainedOutputBytes:65536,modelOutputBytes:65536,retentionDays:7,retentionBytes:67108864};
 return{version:1,source:'legacy-m2',revision:'legacy-m2',settings,providerId:config.providerId,modelId:config.modelId,effectiveOutputTokens};
}
export async function resolveAdmittedLimits(reader:DocumentReader,id:ConversationId,rootId:ConversationId,context:Context):Promise<AdmittedLimits>{
 const doc=await reader.snapshot(ExecutionPolicyDoc,id,context);if(doc?.limits)return structuredClone(doc.limits);
 if(id!==rootId)throw new Error('RUN_SETTINGS_UNAVAILABLE');const legacy=await reader.snapshot(RunSettings,context);if(!legacy)throw new Error('RUN_SETTINGS_UNAVAILABLE');return legacyAdmittedLimits(legacy.config);
}
export async function admitExecutionPolicy(paths:RuntimePaths,config:{providerId:string;modelId:string},maxTokens?:number):Promise<AdmittedLimits>{
 const defaults=await loadWorkLimits(paths);return{version:1,source:'m3',revision:defaults.revision,settings:defaults.settings,providerId:config.providerId,modelId:config.modelId,effectiveOutputTokens:validateExecutionSettings(defaults.settings,config,maxTokens)};
}

export function validateExecutionSettings(settings:WorkLimits,config:{providerId:string;modelId:string},maxTokens?:number):number{if(settings.providerTimeoutMs>2147483647)throw new ConfigError('LIMITS_INVALID');return resolveOutputTokens(settings,{providerId:config.providerId,modelId:config.modelId,maxTokens});}
