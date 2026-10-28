import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import{validateRequest as validateV1Request,validateServerFrame as validateV1ServerFrame}from'./schema.js';
import {validateV2Request as validateRequest,validateV2ServerFrame as validateServerFrame,type V2Request as Request,type V2ServerFrame} from './m2.js';
import {decodeV2Frame as decodeFrame,FrameDecoder as SharedDecoder,BoundedWriter as SharedWriter} from './frames.js';
import{limits}from'./schema.js';
type Frame=Request|V2ServerFrame;
class FrameDecoder extends SharedDecoder<Frame>{constructor(deliver:(f:Frame)=>void){super(deliver,decodeFrame);}}
class BoundedWriter extends SharedWriter<Frame>{}
const request=(text='hello'):Request=>({v:2,id:'r1',method:'conversation.submit',params:{requestId:'request-1',text,selectionRevision:'revision'}});
const bytes=(v:unknown)=>Buffer.from(JSON.stringify(v));
test('shared wire fixtures classify all methods, responses, events and invalid bytes',async()=>{
 const fixtures=JSON.parse(await readFile(new URL('../fixtures/wire-v1.json',import.meta.url),'utf8')) as {name:string;base64:string;direction:string;valid:boolean}[];
 for(const fixture of fixtures){let valid=false;try{const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(Buffer.from(fixture.base64,'base64')));valid=fixture.direction==='request'?validateV1Request(value):validateV1ServerFrame(value);}catch{}
 assert.equal(valid,fixture.valid,fixture.name);}
});
test('fragmented multibyte/coalesced frames deliver once and terminal rejection discards trailing mutation',()=>{
 const frames:Frame[]=[];const decoder=new FrameDecoder(v=>frames.push(v));const input=Buffer.concat([bytes(request('é')),Buffer.from('\n'),bytes(request('next')),Buffer.from('\n')]);
 for(const b of input)decoder.push(Uint8Array.of(b));assert.equal(frames.length,2);
 const delivered:Frame[]=[];const bad=new FrameDecoder(v=>delivered.push(v));
 assert.throws(()=>bad.push(Buffer.from('{}\n'+JSON.stringify(request())+'\n')));
 assert.equal(delivered.length,0);assert.throws(()=>bad.push(Buffer.from(JSON.stringify(request())+'\n')));assert.equal(delivered.length,0);
});
test('UTF-8 and exactly 16384 input bytes are enforced independently of characters',()=>{
 assert.equal(validateRequest(request('é'.repeat(8192))),true);
 assert.equal(validateRequest(request('é'.repeat(8192)+'a')),false);
 assert.equal(validateRequest(request('')),false);
 assert.throws(()=>decodeFrame(Uint8Array.of(0x7b,0x22,0xff,0x22,0x7d)));
 const decoder=new FrameDecoder(()=>{});assert.throws(()=>decoder.push(Buffer.alloc(1048577,32)));
});
test('server views enforce entry, text and total serialized size; sequences are decimal strings',()=>{
 const entry={id:'e',role:'assistant',text:'x',truncated:false};
 const view={conversationId:'root',state:'idle',entries:[entry],olderEntries:false};
 const event=(v:unknown,seq='1')=>({v:2,event:'conversation.updated',epoch:'epoch',subscriptionId:'sub',seq,view:{chat:v,tools:{revision:'0',status:'disabled',operations:[],olderOperations:false}}});
 assert.equal(validateServerFrame(event(view)),true);
 for(const seq of ['-1','1.2','01','1e2',''])assert.equal(validateServerFrame(event(view,seq)),false);
 assert.equal(validateServerFrame(event({...view,entries:Array.from({length:129},()=>entry)})),false);
 assert.equal(validateServerFrame(event({...view,entries:[{...entry,text:'é'.repeat(16385)}]})),false);
 assert.equal(validateServerFrame(event({...view,entries:Array.from({length:16},()=>({...entry,text:'x'.repeat(32768)}))})),false);
});
test('writer honors slow-stream backpressure and byte/frame overflow is terminal',()=>{
 let finish:(()=>void)|undefined;const output:Buffer[]=[];
 const stream=new Writable({highWaterMark:1,write(chunk,_encoding,done){output.push(Buffer.from(chunk));finish=done;}});
 const writer=new BoundedWriter(stream);assert.equal(writer.send(request()),true);assert.equal(output.length,1);
 for(let i=0;i<127;i++)assert.equal(writer.send(request()),true);
 assert.equal(writer.send(request()),false);assert.equal(writer.send(request()),false);assert.equal(stream.destroyed,true);finish?.();
 const large=new Writable({highWaterMark:1,write(_c,_e,_d){}});const bounded=new BoundedWriter(large);
 const frame={...request(),padding:'x'.repeat(1048000)};
 for(let i=0;i<4;i++)assert.equal(bounded.send(frame),true);
 assert.equal(bounded.send(frame),false);assert.equal(large.destroyed,true);
 assert.equal(limits.queueBytes,4194304);
});
test('generator rejects unsupported keywords and produces deterministic validation',async()=>{
 const {generateHeader}=await import('./generate-cpp.js');
 assert.throws(()=>generateHeader({type:'string',format:'email'}),/UNSUPPORTED_SCHEMA/);
 const a=generateHeader();assert.equal(a,generateHeader());assert.ok(a.includes('validateRequest'));
});
