import {createSanitizer,type Sanitizer} from './redact.js';
// Linear prefix matching avoids quadratic scans for long OAuth/API-key values.
export function createLargeSanitizer(values:readonly string[]):Sanitizer{
 const secrets=[...new Set(values.filter(Boolean))];if(secrets.length>128||secrets.reduce((n,s)=>n+Buffer.byteLength(s),0)>2097152)throw new Error('SECRET_UNSUPPORTED');
 const generic=createSanitizer([]);
 function stream(){
  const decoder=new TextDecoder('utf-8',{fatal:true}),tail=generic.stream();let pending='',base=0,end=0,done=false,masked=false;
  const patterns=secrets.map(key=>{const prefix=new Uint32Array(key.length);for(let i=1,j=0;i<key.length;i++){while(j&&key[i]!==key[j])j=prefix[j-1]!;if(key[i]===key[j])j++;prefix[i]=j;}return{key,prefix,state:0};});
  let matches:{start:number;end:number}[]=[];
  function addMatch(start:number,end:number){while(matches.length&&matches[matches.length-1]!.end>=start)start=Math.min(start,matches.pop()!.start);matches.push({start,end});}
  function scan(text:string){pending+=text;for(let i=0;i<text.length;i++){end++;for(const p of patterns){while(p.state&&text[i]!==p.key[p.state])p.state=p.prefix[p.state-1]!;if(text[i]===p.key[p.state])p.state++;if(p.state===p.key.length){addMatch(end-p.key.length,end);p.state=p.prefix[p.state-1]!;}}}}
  function flush(final=false){let cut=final?end:Math.max(base,end-Math.max(0,...patterns.map(p=>p.state)));for(const m of matches)if(m.start<=cut&&m.end>cut)cut=m.end;let cursor=base,out='';for(const m of matches){if(m.start>=cut)break;const start=Math.max(base,m.start);if(start>cursor){out+=pending.slice(cursor-base,start-base);masked=false;}if(m.end>cursor){if(!masked)out+='[REDACTED]';masked=true;cursor=m.end;}}if(cursor<cut){out+=pending.slice(cursor-base,cut-base);masked=false;}pending=pending.slice(cut-base);base=cut;matches=matches.filter(m=>m.end>cut);if(pending.length>2097152)throw new Error('OUTPUT_UNSUPPORTED');return out;}
  return{push(bytes:Uint8Array){if(done)throw new Error('STREAM_CLOSED');let out='';for(let i=0;i<bytes.length;i+=4096){scan(decoder.decode(bytes.subarray(i,i+4096),{stream:true}));out+=tail.push(Buffer.from(flush()));}return out;},finish(truncated:boolean){if(done)throw new Error('STREAM_CLOSED');done=true;if(truncated){pending='';return tail.finish(true);}scan(decoder.decode());return tail.push(Buffer.from(flush(true)))+tail.finish(false);}};
 }
 return{seeds:()=>[...secrets],contains:s=>secrets.some(k=>s.includes(k)),stream,text:s=>{if(Buffer.byteLength(s)>1048576)throw new Error('OUTPUT_UNSUPPORTED');const x=stream();return x.push(Buffer.from(s))+x.finish(false);}};
}
