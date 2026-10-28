import type { Writable } from 'node:stream';
import{limits}from'./schema.js';
import{validateV4Request as validateRequest,validateV4ServerFrame as validateServerFrame,type V4Request,type V4ServerFrame}from'./v4.js';
import{validateV2Request,validateV2ServerFrame,type V2Request,type V2ServerFrame}from'./m2.js';
type Frame=V4Request|V4ServerFrame;
export function decodeV2Frame(bytes:Uint8Array):V2Request|V2ServerFrame{if(bytes.byteLength>limits.frame)throw new Error('FRAME_TOO_LARGE');const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!validateV2Request(value)&&!validateV2ServerFrame(value))throw new Error('INVALID_FRAME');return value;}
export function decodeFrame(bytes:Uint8Array):Frame{
 if(bytes.byteLength>limits.frame)throw new Error('FRAME_TOO_LARGE');
 const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!validateRequest(value)&&!validateServerFrame(value))throw new Error('INVALID_FRAME');return value;
}
export class FrameDecoder<F=Frame> {
 private buffer=Buffer.alloc(0);private terminal=false;
 constructor(private deliver:(frame:F)=>void,private decode:(bytes:Uint8Array)=>F=decodeFrame as unknown as (bytes:Uint8Array)=>F){}
 push(bytes:Uint8Array):void {
  if(this.terminal)throw new Error('CONNECTION_REJECTED');
  try{
   // Copy only the bounded current frame, even when a chunk coalesces many frames.
   let start=0;
   for(let end=0;end<=bytes.length;end++){
    if(end!==bytes.length&&bytes[end]!==10)continue;
    const part=bytes.subarray(start,end);
    if(this.buffer.length+part.length>limits.frame)throw new Error('FRAME_TOO_LARGE');
    this.buffer=Buffer.concat([this.buffer,part]);
    if(end!==bytes.length){const frame=this.decode(this.buffer);this.buffer=Buffer.alloc(0);this.deliver(frame);}start=end+1;
   }
  }catch(e){this.terminal=true;this.buffer=Buffer.alloc(0);throw e;}
 }
}
export class BoundedWriter<F=Frame> {
 private queue:Buffer[]=[];private queuedBytes=0;private blocked=false;private terminal=false;private pending=0;
 constructor(private stream:Writable){stream.on('drain',()=>{this.blocked=false;this.flush();});stream.on('close',()=>{this.terminal=true;this.queue=[];this.queuedBytes=0;});}
 send(frame:F):boolean{
  if(this.terminal||this.stream.destroyed)return false;
  const buffer=Buffer.from(JSON.stringify(frame)+'\n');
  if(buffer.length-1>limits.frame||this.queuedBytes+this.stream.writableLength+buffer.length>limits.queueBytes||this.queue.length+this.pending>=limits.queueFrames){this.terminal=true;this.queue=[];this.queuedBytes=0;this.stream.destroy();return false;}
  this.queue.push(buffer);this.queuedBytes+=buffer.length;this.flush();return true;
 }
 private flush():void{
  while(!this.terminal&&!this.blocked&&this.queue.length){const buffer=this.queue.shift()!;this.queuedBytes-=buffer.length;this.pending++;
   this.blocked=!this.stream.write(buffer,()=>{this.pending--;});
  }
 }
}
