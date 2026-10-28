import type { ApiKeyCredential,CredentialStore,Credential } from '@earendil-works/pi-ai';
import { CredentialError } from './errors.js';
export function resolveKey(credential:ApiKeyCredential,env:Record<string,string|undefined>=process.env):string{
 const key=credential.key;if(!key)throw new CredentialError('AUTH_REQUIRED');
 if(key.startsWith('!'))throw new CredentialError('UNSUPPORTED_CREDENTIAL');
 let missing=false;
 const resolved=key.replace(/\$(\$|!|\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/g,(_whole,part:string)=>{
  if(part==='$'||part==='!')return part;
  const name=part.startsWith('{')?part.slice(1,-1):part;
  const value=credential.env?.[name]||env[name];if(value===undefined){missing=true;return '';}return value;
 });
 if(missing||!resolved)throw new CredentialError('AUTH_REQUIRED');return resolved;
}
// Used only at the provider request boundary. Metadata uses the raw store.
export function requestCredentialStore(store:CredentialStore,env:Record<string,string|undefined>=process.env,onResolved?:(key:string)=>void):CredentialStore{
 return {
  ...store,
  async read(id,options):Promise<Credential|undefined>{
   const credential=await store.read(id,options);if(!credential)throw new CredentialError('AUTH_REQUIRED');
   if(credential.type!=='api_key')throw new CredentialError('UNSUPPORTED_CREDENTIAL');
   const key=resolveKey(credential,env);onResolved?.(key);return {...credential,key};
  }
 };
}
