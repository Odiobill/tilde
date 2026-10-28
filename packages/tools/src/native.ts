import{readFileSync}from'node:fs';
import{createRequire}from'node:module';import type{FileState}from'./paths.js';
export type NativeStage={handle:object;token:string;state:FileState};
export type ScopedNative={open(path:string,maxBytes?:number):object;monotonicNowMs():number;close(root:object):void;read(root:object,path:string,max:number):{bytes:Buffer;state:FileState}|null;stage(root:object,path:string,bytes:Buffer,expected:string):NativeStage;commit(stage:object):FileState;discard(stage:object):void;mkdir(root:object,path:string):FileState;move(root:object,from:string,dest:object,to:string,expected:string):FileState};
export const native=createRequire(import.meta.url)('../.build/tilde_scoped_fs.node') as ScopedNative;

export const monotonicNowMs=()=>native.monotonicNowMs();

export const currentBootId=()=>readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
