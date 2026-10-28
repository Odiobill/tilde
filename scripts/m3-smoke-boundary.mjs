// One private quota is shared across all model/store rebindings in this helper process.
export function createSmokeBoundary(){
 let requests=0,denied=0;const wrapped=new WeakSet();
 return{
  wrap(models){if(wrapped.has(models))return models;const stream=models.streamSimple.bind(models);models.streamSimple=(model,context,options={})=>{
   if(context?.tools?.length){denied++;throw Error('SMOKE_TOOLS_FORBIDDEN');}
   if(model?.provider!=='opencode-go'||model?.id!=='deepseek-v4.1-flash'){denied++;throw Error('SMOKE_TARGET_MISMATCH');}
   if(requests>=1){denied++;throw Error('SMOKE_REQUEST_LIMIT');}requests++;
   return stream(model,context,{...options,maxTokens:8192,timeoutMs:60000,maxRetries:0});
  };wrapped.add(models);return models;},
  metrics(){return{requests,denied};}
 };
}
