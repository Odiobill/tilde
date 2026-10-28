export interface Sanitizer {text(value:string):string;stream():{push(bytes:Uint8Array):string;finish(truncated:boolean):string};contains(value:string):boolean;seeds():readonly string[]}
const generic=()=>[/\b(Authorization\s*:\s*Bearer\s+)[^\s"'<>]+/gi,/\b((?:api[_-]?key|access[_-]?token|password|secret)\s*[=:]\s*["']?)[^\s"'<>]+/gi,/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,})/g];
export function createSanitizer(values:readonly string[]):Sanitizer{
 if(values.some(s=>Buffer.byteLength(s)>4096))throw new Error('SECRET_UNSUPPORTED');
 const secrets=[...new Set(values.filter(Boolean))].sort((a,b)=>b.length-a.length);
 const text=(value:string)=>{
  if(Buffer.byteLength(value)>1048576)throw new Error('OUTPUT_UNSUPPORTED');
  for(const key of secrets)value=value.split(key).join('[REDACTED]');
  for(const regex of generic())value=value.replace(regex,(_m,prefix)=>typeof prefix==='string'?prefix+'[REDACTED]':'[REDACTED]');
  return value;
 };
 return {text,contains:value=>secrets.some(s=>value.includes(s)),seeds:()=>[...secrets],stream:()=>{
  const decoder=new TextDecoder('utf-8',{fatal:true});let pending='',done=false;
  const ranges=()=>{const result:{start:number;end:number}[]=[];for(const key of secrets){let at=0;while((at=pending.indexOf(key,at))>=0){result.push({start:at,end:at+key.length});at+=1;}}for(const re of generic())for(const m of pending.matchAll(re))result.push({start:m.index,end:m.index+m[0].length});return result;};
  return {push(bytes){if(done)throw new Error('STREAM_CLOSED');let result='';for(let i=0;i<bytes.length;i+=4096){try{pending+=decoder.decode(bytes.subarray(i,i+4096),{stream:true});}catch{done=true;pending='';throw new Error('ENCODING_UNSUPPORTED');}
   let cut=pending.length;
   for(const key of secrets)for(let n=1;n<key.length&&n<=pending.length;n++)if(pending.endsWith(key.slice(0,n)))cut=Math.min(cut,pending.length-n);
   for(const regex of generic())for(const match of pending.matchAll(regex))if(match.index+match[0].length===pending.length)cut=Math.min(cut,match.index);
   const triggers=['authorization:bearer','apikey=','apikey:','api_key=','api_key:','api-key=','api-key:','accesstoken=','accesstoken:','access_token=','access_token:','access-token=','access-token:','password=','password:','secret=','secret:','sk-','ghp_','gho_','ghu_','ghs_','ghr_'];
   for(let at=0;at<pending.length;at++)if((at===0||!/[A-Za-z0-9_]/.test(pending[at-1]!))&&/[aAgGpPsS]/.test(pending[at]!)){
    const suffix=pending.slice(at),normalized=suffix.replace(/[\s"']/g,'').toLowerCase();
    if(triggers.some(t=>t.startsWith(normalized))||/^(?:sk-[A-Za-z0-9_-]*|gh[pousr]_[A-Za-z0-9_]*)$/.test(suffix))cut=Math.min(cut,at);
   }
   const complete=ranges();for(;;){const crossing=complete.filter(r=>r.start<cut&&cut<r.end);if(!crossing.length)break;cut=Math.min(...crossing.map(r=>r.start));}
   if(pending.length-cut>8192){done=true;pending='';throw new Error('OUTPUT_UNSUPPORTED');}
   result+=text(pending.slice(0,cut));pending=pending.slice(cut);
  }return result;},finish(truncated){if(done)throw new Error('STREAM_CLOSED');done=true;if(!truncated){try{pending+=decoder.decode();}catch{pending='';throw new Error('ENCODING_UNSUPPORTED');}return text(pending);}
   // The pending suffix can still become a credential; never flush it after a byte cap.
   return '[TRUNCATED]';}
  };
 }};
}
// Inspect decoded values: JSON escaping must not conceal a known literal.
export function containsSecret(sanitizer:Sanitizer,value:unknown):boolean{if(typeof value==='string')return sanitizer.contains(value);if(Array.isArray(value))return value.some(v=>containsSecret(sanitizer,v));if(value&&typeof value==='object')return Object.entries(value).some(([k,v])=>sanitizer.contains(k)||containsSecret(sanitizer,v));return false;}
export function containsSensitive(sanitizer:Sanitizer,value:unknown,maxBytes=1048576):boolean{if(typeof value==='string')return sanitizer.contains(value)||sanitizeBounded(sanitizer,value,maxBytes)!==value;if(Array.isArray(value))return value.some(v=>containsSensitive(sanitizer,v,maxBytes));if(value&&typeof value==='object')return Object.entries(value).some(([k,v])=>sanitizer.contains(k)||containsSensitive(sanitizer,v,maxBytes));return false;}
// Explicit larger engineering envelope; the legacy text() bound stays intact.
export function sanitizeBounded(sanitizer:Sanitizer,value:string,maxBytes:number):string{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>67108864||Buffer.byteLength(value)>maxBytes)throw new Error('OUTPUT_UNSUPPORTED');
 if(maxBytes<=1048576)return sanitizer.text(value);
 const input=Buffer.from(value),stream=sanitizer.stream();let output='',bytes=0;
 const append=(text:string)=>{bytes+=Buffer.byteLength(text);if(bytes>maxBytes)throw new Error('OUTPUT_UNSUPPORTED');output+=text;};
 for(let offset=0;offset<input.length;offset+=32768)append(stream.push(input.subarray(offset,offset+32768)));append(stream.finish(false));return output;
}
