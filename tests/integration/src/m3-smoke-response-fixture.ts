// Actual smoke subprocess, real SDK/SQLite; transport is synthetic and all sockets stay denied.
import './m3-smoke-network-fixture.js';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';

const marker=process.env.TILDE_FIXTURE_FETCH_MARKER;
if(!marker)throw Error('FIXTURE_MARKER_REQUIRED');
const mode=process.env.TILDE_SMOKE_RESPONSE_MODE;
if(!['stop','length','empty','http-error'].includes(mode??''))throw Error('FIXTURE_MODE_REQUIRED');
globalThis.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 assert.equal(url,'https://opencode.ai/inference/go/v1/chat/completions');
 const raw=init?.body??(input instanceof Request?await input.clone().text():undefined);
 assert.equal(typeof raw,'string');
 const body=JSON.parse(raw as string) as Record<string,any>;
 appendFileSync(marker,JSON.stringify({mode,model:body.model,outputCap:body.max_tokens??body.max_completion_tokens,tools:body.tools?.length??0})+'\n',{mode:0o600});
 if(mode==='http-error')return new Response(JSON.stringify({error:{message:'Synthetic unavailable transport',type:'fixture'}}),{status:503,headers:{'content-type':'application/json'}});
 const chunk=(delta:Record<string,string>,finish_reason:string|null)=>'data: '+JSON.stringify({id:'smoke-fixture',object:'chat.completion.chunk',created:1,model:'deepseek-v4.1-flash',choices:[{index:0,delta,finish_reason}]})+'\n\n';
 return new Response(new ReadableStream({start(controller){
  const send=(s:string)=>controller.enqueue(new TextEncoder().encode(s));
  send(chunk({role:'assistant',content:mode==='empty'?'':'A user can inspect status and logs without changing the service.'},null));
  setTimeout(()=>{send(chunk({},mode==='length'?'length':'stop')+'data: [DONE]\n\n');controller.close();},300);
 }}),{headers:{'content-type':'text/event-stream'}});
};
