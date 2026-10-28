import{createLargeSanitizer}from'@tilde/tools/secret-stream';import type{Sanitizer}from'@tilde/tools/redact';import{CredentialError}from'./errors.js';
export interface SecretScope extends Sanitizer{capture(value:string):void;retainJob(id:string):void;releaseJob(id:string):void;closeRequest():void}
export function createSecretScope():SecretScope{
 const values=new Set<string>(),jobs=new Set<string>();let bytes=0,closed=false,emitting=false;
 const assertOpen=()=>{if(closed&&!jobs.size)throw new CredentialError('SECRET_SCOPE_CLOSED');};
 const begin=()=>{assertOpen();emitting=true;return createLargeSanitizer([...values]);};
 return{capture(v){if(!v||values.has(v))return;if(closed&&!jobs.size||emitting||values.size>=128||bytes+Buffer.byteLength(v)>2097152)throw new CredentialError('SECRET_UNSUPPORTED');values.add(v);bytes+=Buffer.byteLength(v);},retainJob(id){assertOpen();if(closed||!id||jobs.has(id))throw new CredentialError('SECRET_SCOPE_CLOSED');jobs.add(id);},releaseJob(id){if(!jobs.delete(id))throw new CredentialError('SECRET_SCOPE_CLOSED');if(closed&&!jobs.size){values.clear();bytes=0;}},closeRequest(){closed=true;if(!jobs.size){values.clear();bytes=0;}},seeds:()=>[...values],contains:v=>{assertOpen();return [...values].some(s=>v.includes(s));},text:v=>begin().text(v),stream(){let actual:ReturnType<Sanitizer['stream']>|undefined;const get=()=>actual??=begin().stream();return{push:v=>get().push(v),finish:t=>get().finish(t)};}};
}
