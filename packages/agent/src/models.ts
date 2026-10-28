import { createModels } from '@earendil-works/pi-ai/models';
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go';
import type { CredentialStore,FetchFunction,Models } from '@earendil-works/pi-ai';
import { requestCredentialStore } from '@tilde/credentials';
export function createOpenCodeModels(credentials:CredentialStore,fetch?:FetchFunction,onResolved?:(key:string)=>void):Models{
 const models=createModels({credentials:requestCredentialStore(credentials,process.env,onResolved),authContext:{env:async()=>undefined,fileExists:async()=>false}});
 const provider=opencodeGoProvider();
 if(fetch){const original=provider.streamSimple;provider.streamSimple=(model,context,options)=>original(model,context,{...options,fetch});}
 models.setProvider(provider);return models;
}
