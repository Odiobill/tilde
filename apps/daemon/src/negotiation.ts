import{limits,validateV4Request,validateV4ServerFrame,validateV3Request,validateV2Request,type V2Request,type V2ServerFrame,type V3Request,type V4Request,type V4ServerFrame}from'@tilde/protocol';import{validateRequest as validateV1Request,type Request as V1Request}from'../../../packages/protocol/dist/schema.js';
export type CurrentFrame=V4Request|V4ServerFrame;
export type LegacyHello=Extract<V1Request|V2Request|V3Request,{method:'system.hello'}>;
export type Incoming=CurrentFrame|LegacyHello;
export function decodeNegotiationFrame(bytes:Uint8Array):Incoming{if(bytes.byteLength>limits.frame)throw new Error('FRAME_TOO_LARGE');const frame:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(validateV4Request(frame)||validateV4ServerFrame(frame))return frame;if((validateV1Request(frame)||validateV2Request(frame)||validateV3Request(frame))&&frame.method==='system.hello')return frame;throw new Error('INVALID_FRAME');}
export type LegacyMismatch={v:1|2|3;id:string;epoch:string;ok:false;error:{code:'PROTOCOL_MISMATCH';message:string}};
