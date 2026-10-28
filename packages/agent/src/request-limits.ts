import type{AdmittedLimits}from'@tilde/protocol';
import{containsSensitive,sanitizeBounded}from'@tilde/tools';
import type { Models,Model,AssistantMessage,AssistantMessageEvent,AssistantMessageEventStream as Stream,SimpleStreamOptions } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
export function safeCode(error:unknown):string{
 const text=typeof error==='string'?error:error instanceof Error?error.message:'';
 if(['INVALID_DURATION','LIMITS_INVALID','STORAGE_FAILED','OUTPUT_LIMIT','EMPTY_RESPONSE','INVALID_TOOL_CALL','SECRET_ARGUMENT','TOOL_BUDGET','REQUEST_BUDGET','POLICY_CHANGED','APPROVAL_DENIED','APPROVAL_EXPIRED','OUTCOME_UNKNOWN'].includes(text))return text;
 if(/TOOLS?_DISABLED/.test(text))return 'TOOLS_DISABLED';
 if(/401|unauthorized|AUTH_REQUIRED|UNSUPPORTED_CREDENTIAL/i.test(text))return 'AUTH_REQUIRED';
 if(/429|rate.limit/i.test(text))return 'RATE_LIMITED';
 if(/timeout|timed.out/i.test(text))return 'PROVIDER_TIMEOUT';
 return 'PROVIDER_FAILED';
}
function failure(model:Model<string>,code:string,aborted=false):AssistantMessage{
 return {role:'assistant',api:model.api,provider:model.provider,model:model.id,content:[],stopReason:aborted?'aborted':'error',errorMessage:code,timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
}
export type ToolEventGuard={sanitizer:import('@tilde/tools').Sanitizer;validate(name:string,args:unknown):boolean;claimRequest?():AdmittedLimits|undefined};
export function withRequestLimits(models:Models,timeoutMs=60000,guard?:ToolEventGuard):Models{
 function guarded<O extends {signal?:AbortSignal}>(model:Model<string>,options:O|undefined,start:(options:O & {maxTokens:number;timeoutMs:number;maxRetries:number;signal:AbortSignal})=>Stream):Stream{
  const output=new AssistantMessageEventStream();
  const abort=new AbortController();const signal=options?.signal?AbortSignal.any([options.signal,abort.signal]):abort.signal;
  let timer:NodeJS.Timeout|undefined;
  void (async()=>{
   try{
    const policy=guard?.claimRequest?.();
    if(policy&&(policy.providerId!==model.provider||policy.modelId!==model.id))throw new Error('POLICY_CHANGED');
    let aggregateBytes=0;const aggregateLimit=policy?.source==='m3'?67108864:1048576;
    const maxTokens=policy?.effectiveOutputTokens??(model.provider==='opencode-go'&&model.id==='deepseek-v4.1-flash'?8192:2048);
    const effectiveTimeout=policy?.settings.providerTimeoutMs??timeoutMs;if(policy&&effectiveTimeout>2147483647)throw new Error('INVALID_DURATION');
    const startedAt=performance.now();
    const deadline=()=>{const remaining=effectiveTimeout-(performance.now()-startedAt);if(remaining<=0){abort.abort(new Error('PROVIDER_TIMEOUT'));return;}timer=setTimeout(deadline,Math.min(remaining,2147483647));};deadline();
    const stream=start({...options,maxTokens,timeoutMs:policy?.settings.providerTimeoutMs??60000,maxRetries:0,signal} as O & {maxTokens:number;timeoutMs:number;maxRetries:number;signal:AbortSignal});
    const iterator=stream[Symbol.asyncIterator]();const textStream=guard?.sanitizer.stream();let progress:AssistantMessage={...failure(model,''),stopReason:'stop',content:[]};delete progress.errorMessage;let started=false;
    const emitText=(delta:string)=>{if(!delta)return;if(!started){output.push({type:'start',partial:structuredClone(progress)});started=true;}if(!progress.content.length){progress.content.push({type:'text',text:''});output.push({type:'text_start',contentIndex:0,partial:structuredClone(progress)});}const block=progress.content[0];if(block?.type==='text')block.text+=delta;output.push({type:'text_delta',contentIndex:0,delta,partial:structuredClone(progress)});};
    for(;;){
     const next=await new Promise<IteratorResult<AssistantMessageEvent>>((resolve,reject)=>{
      const aborted=()=>reject(signal.reason??new Error('PROVIDER_TIMEOUT'));
      if(signal.aborted){aborted();return;}
      signal.addEventListener('abort',aborted,{once:true});
      void iterator.next().then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));
     });
     if(next.done)break;const original=next.value;
     const event=structuredClone(original);
     if(!guard&&(('partial' in event&&event.partial.content.some(c=>c.type==='toolCall'))||('message' in event&&event.message.content.some(c=>c.type==='toolCall')))){abort.abort(new Error('TOOL_DISABLED'));throw new Error('TOOL_DISABLED');}
     if(guard){
      const message='partial'in event?event.partial:'message'in event?event.message:undefined;
      if(policy?.source==='m3'&&'delta' in event&&typeof event.delta==='string'){aggregateBytes+=Buffer.byteLength(event.delta);if(aggregateBytes>aggregateLimit)throw new Error('INVALID_TOOL_CALL');}
      if(message&&Buffer.byteLength(JSON.stringify(message))>aggregateLimit)throw new Error('INVALID_TOOL_CALL');
      if(event.type==='text_delta')emitText(textStream!.push(Buffer.from(event.delta)));
      if(event.type!=='done'&&event.type!=='error')continue;
      if(event.type==='done'){
       for(const block of event.message.content)if(block.type==='toolCall'){if(policy?.source==='m3'&&(!block.id||Buffer.byteLength(block.id)>128))throw new Error('INVALID_TOOL_CALL');if(!guard.validate(block.name,block.arguments))throw new Error('INVALID_TOOL_CALL');if(containsSensitive(guard.sanitizer,block.arguments,aggregateLimit))throw new Error('SECRET_ARGUMENT');}
       const sanitize=(v:unknown):unknown=>typeof v==='string'?(policy?.source==='m3'?sanitizeBounded(guard.sanitizer,v,aggregateLimit):guard.sanitizer.text(v)):Array.isArray(v)?v.map(sanitize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['diagnostics','thinkingSignature','textSignature'].includes(k)).map(([k,x])=>[k,sanitize(x)])):v;
       emitText(textStream!.finish(false));const safe=sanitize(event.message) as AssistantMessage;const joinedText=event.message.content.filter(b=>b.type==='text').map(b=>b.text).join('');if(joinedText){safe.content=safe.content.filter(b=>b.type!=='text');safe.content.unshift({type:'text',text:policy?.source==='m3'?sanitizeBounded(guard.sanitizer,joinedText,aggregateLimit):guard.sanitizer.text(joinedText)});}
       // Arguments describe the approved action: validate rather than mask them.
       event.message=safe;if(!started)output.push({type:'start',partial:{...safe,content:[]}});
      }
     }
     if(event.type==='error'){const message=failure(model,safeCode(event.error.errorMessage),event.reason==='aborted'&&!abort.signal.aborted);output.push({type:'error',reason:message.stopReason==='aborted'?'aborted':'error',error:message});return;}
     if(event.type==='done'&&event.message.stopReason==='deferred')throw new Error('UNSUPPORTED_DEFERRED');
     if(event.type==='done'&&!event.message.content.some(block=>block.type==='text'&&block.text.trim().length||guard&&block.type==='toolCall')){
      const message=failure(model,event.reason==='length'?'OUTPUT_LIMIT':'EMPTY_RESPONSE');
      const usage=event.message.usage;
      message.usage={input:usage.input,output:usage.output,cacheRead:usage.cacheRead,cacheWrite:usage.cacheWrite,totalTokens:usage.totalTokens,cost:{input:usage.cost.input,output:usage.cost.output,cacheRead:usage.cost.cacheRead,cacheWrite:usage.cost.cacheWrite,total:usage.cost.total}};
      output.push({type:'error',reason:'error',error:message});return;
     }
     if('partial' in event)delete event.partial.diagnostics;
     if('message' in event)delete event.message.diagnostics;
     output.push(event as AssistantMessageEvent);
    }
   }catch(error){const message=failure(model,safeCode(abort.signal.reason??error),!!options?.signal?.aborted);output.push({type:'error',reason:message.stopReason==='aborted'?'aborted':'error',error:message});}
   finally{clearTimeout(timer);}
  })();
  return output;
 }
 const result:Models={...models,
  streamSimple:(model,context,options)=>guarded(model,options,o=>models.streamSimple(model,context,o)),
  stream:(model,context,options)=>guarded(model,options,o=>models.stream(model,context,o)),
  completeSimple:(model,context,options)=>result.streamSimple(model,context,options).result(),
  complete:(model,context,options)=>result.stream(model,context,options).result(),
 };
 return new Proxy(models,{get(target,key){if(Object.hasOwn(result,key))return Reflect.get(result,key);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
}
