export type Distribution = { samples:number[]; count:number; minimum:number; median:number; p95:number; maximum:number; misses:number; thresholdMs:number };
export function distribution(samples:number[],thresholdMs:number):Distribution {
 if(!samples.length||samples.some(n=>!Number.isFinite(n)||n<0)||!Number.isFinite(thresholdMs)||thresholdMs<=0)throw Error('PERFORMANCE_SAMPLES_INVALID');
 const sorted=[...samples].sort((a,b)=>a-b);
 return {samples:[...samples],count:samples.length,minimum:sorted[0]!,median:sorted[Math.floor(sorted.length/2)]!,p95:sorted[Math.ceil(sorted.length*.95)-1]!,maximum:sorted.at(-1)!,misses:samples.filter(n=>n>=thresholdMs).length,thresholdMs};
}
// A successful ACK or offscreen focus cannot prove actual compositor focus.
export function referenceQualified(input:unknown):boolean {
 if(!input||typeof input!=='object')return false;
 const v=input as Record<string,unknown>;
 if(!['wayland','xcb'].includes(String(v.backend))||v.defaultRenderer!==true||v.focused!==true||v.cleanup!==true||v.resourcesPassed!==true)return false;
 const within=(key:string,minimum:number,limit:number)=>Array.isArray(v[key])&&(v[key] as unknown[]).length>=minimum&&(v[key] as unknown[]).every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<limit);
 return within('warmMs',10,300)&&within('coldMs',5,1500)&&within('reconnectMs',5,3000);
}
