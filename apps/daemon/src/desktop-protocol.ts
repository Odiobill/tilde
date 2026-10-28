import type{NoticeInput}from'./notifications.js';
export type DesktopOutput={v:1;event:'ready';available:boolean;actions:boolean;ownerRevision:string}|{v:1;event:'result';id:string;status:'delivered'|'unavailable'|'failed';ownerRevision:string}|{v:1;event:'open';id:string;ownerRevision:string};
const opaque=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
function object(v:unknown):v is Record<string,unknown>{return!!v&&typeof v==='object'&&!Array.isArray(v)&&Buffer.byteLength(JSON.stringify(v))<=4096;}
function keys(v:Record<string,unknown>,names:string[]){return Object.keys(v).length===names.length&&names.every(n=>Object.hasOwn(v,n));}
export function validDesktopInput(v:unknown):v is NoticeInput{return object(v)&&keys(v,['v','id','kind'])&&v.v===1&&opaque(v.id)&&['completion','approval','attention'].includes(String(v.kind));}
export function validDesktopOutput(v:unknown):v is DesktopOutput{if(!object(v)||v.v!==1||!opaque(v.ownerRevision))return false;
 if(v.event==='ready')return keys(v,['v','event','available','actions','ownerRevision'])&&typeof v.available==='boolean'&&typeof v.actions==='boolean'&&(v.available||!v.actions);
 if(v.event==='result')return keys(v,['v','event','id','status','ownerRevision'])&&opaque(v.id)&&['delivered','unavailable','failed'].includes(String(v.status));
 return v.event==='open'&&keys(v,['v','event','id','ownerRevision'])&&opaque(v.id);
}
