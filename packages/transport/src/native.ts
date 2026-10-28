import { createRequire } from 'node:module';
import { Duplex } from 'node:stream';
export type NativeStream={start(data:(bytes:Buffer)=>void,end:(error?:Error)=>void):void;pause(paused:boolean):void;write(data:Buffer,done:(error?:Error)=>void):void;close():void};
type NativeModule={listen(path:string,onClient:(stream:NativeStream,uid:number,pid:number,gid:number)=>void):{close():void}};
export const native=createRequire(import.meta.url)('../.build/tilde_peer.node') as NativeModule;
export function duplex(handle:NativeStream):Duplex{
 const stream=new Duplex({highWaterMark:16384,
  read(){handle.pause(false);},
  write(bytes:Buffer,_encoding,done){try{handle.write(bytes,done);}catch{done(new Error('NATIVE_WRITE_FAILED'));}},
  destroy(error,done){handle.close();done(error);}
 });
 handle.start(bytes=>{if(!stream.push(bytes))handle.pause(true);},error=>{if(!stream.destroyed){stream.push(null);stream.destroy(error);}});
 return stream;
}
