import type{Conversation,Cursor,EntryId,EntryRecord}from'@earendil-works/pi-durable';
import{BACKGROUND_CONTEXT as context}from'@earendil-works/chord/context';
import type{HistoryPage,HistoryRow,SourceChunk}from'@tilde/protocol';
import{createHash}from'node:crypto';import{clip}from'./projection.js';
export function publicPiId(id:string):number{if(!/^[1-9][0-9]{0,15}$/.test(id)||BigInt(id)>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('INVALID_PI_ID');return Number(id);}
export function messageText(message:NonNullable<EntryRecord['model']>[number]):string{return typeof message.content==='string'?message.content:message.content.filter(c=>c.type==='text').map(c=>c.text).join('');}
type Position={v:1;kind:'history';cid:string;sdk?:Cursor;pending?:{id:string;index:number;after?:Cursor}};
function encode(p:Position):string{const s=Buffer.from(JSON.stringify(p)).toString('base64url');if(s.length>2048)throw new Error('HISTORY_CURSOR_TOO_LARGE');return s;}
export class HistoryReader{
 constructor(private readonly id:string,private readonly conversation:Pick<Conversation,'entries'>,private readonly anchor?:(entry:EntryRecord,callId:string)=>Promise<{generationTaskId:string;operationId:string;fingerprint:string}|undefined>,private readonly generation?:(entry:EntryRecord)=>Promise<string|undefined>){}
 private async rows(entry:EntryRecord):Promise<(HistoryRow|null)[]>{const rows:(HistoryRow|null)[]=[];const generationTaskId=entry.model?.some(m=>m.role==='assistant')?await this.generation?.(entry):undefined;for(const [messageIndex,m]of(entry.model??[]).entries()){if(m.role!=='user'&&m.role!=='assistant')continue;const key=`${this.id}:${entry.id}:${messageIndex}`,id=createHash('sha256').update(key).digest('hex');rows.push({kind:'message',id,entryId:String(entry.id),messageIndex,role:m.role,...clip(messageText(m),32768),...(m.role==='assistant'?{model:{providerId:m.provider,modelId:m.model},stopReason:m.stopReason,...(generationTaskId?{generationTaskId}:{})}:{})});if(m.role==='assistant')for(const [index,block]of m.content.entries())if(block.type==='toolCall'){const verified=await this.anchor?.(entry,block.id);rows.push(verified?{kind:'tool_anchor',id:createHash('sha256').update(`${key}:tool:${index}`).digest('hex'),entryId:String(entry.id),callId:block.id,...verified}:null);}}return rows;}

 async page(cursor?:string):Promise<HistoryPage>{
  let p:Position={v:1,kind:'history',cid:this.id};if(cursor!==undefined){try{if(cursor.length>2048)throw 0;const b=Buffer.from(cursor,'base64url');if(b.toString('base64url')!==cursor)throw 0;const c=JSON.parse(b.toString());if(c.v!==1||c.kind!=='history'||c.cid!==this.id||c.sdk!==undefined&&(typeof c.sdk!=='object'||!c.sdk||Array.isArray(c.sdk))||c.pending&&(!Number.isSafeInteger(c.pending.index)||c.pending.index<0))throw 0;if(c.pending)publicPiId(c.pending.id);p=c;}catch{throw new Error('INVALID_HISTORY_CURSOR');}}
  const rows:HistoryRow[]=[];let done=false,raw=0;
  while(raw<128&&rows.length<32&&!done){
   let entry:EntryRecord|undefined,after:Cursor|undefined,index:number;
   if(p.pending){const q=p.pending;entry=(await this.conversation.entries({minEntryId:publicPiId(q.id) as EntryId,maxEntryId:publicPiId(q.id) as EntryId},1,undefined,context)).items[0];after=q.after;index=q.index;if(!entry||String(entry.id)!==q.id)throw new Error('HISTORY_SOURCE_UNAVAILABLE');}
   else{const page=await this.conversation.entries({order:'descending'},1,p.sdk,context);entry=page.items[0];after=page.next;index=-1;if(!entry){done=true;break;}}
   raw++;const material=await this.rows(entry);if(!p.pending)index=material.length-1;if(index>=material.length)throw new Error('INVALID_HISTORY_CURSOR');
   for(;index>=0;index--){let row=material[index];if(!row)continue;const candidate={conversationId:this.id,rows:[row,...rows]};if(Buffer.byteLength(JSON.stringify(candidate))>193000){if(rows.length)break;if(row.kind==='message'){const excess=Buffer.byteLength(JSON.stringify(candidate))-190000;row={...row,...clip(row.text,Math.max(0,Buffer.byteLength(row.text)-excess)),truncated:true};}}
    rows.unshift(row);if(rows.length===32){index--;break;}}
   if(index>=0){p={v:1,kind:'history',cid:this.id,pending:{id:String(entry.id),index,...(after?{after}:{})}};break;}
   if(after)p={v:1,kind:'history',cid:this.id,sdk:after};else done=true;
  }
  return{conversationId:this.id,rows,...(!done?{next:encode(p)}:{})};
 }
 async source(entryId:string,messageIndex:number,offset:number):Promise<SourceChunk>{
  const id=publicPiId(entryId) as EntryId;if(!Number.isSafeInteger(messageIndex)||messageIndex<0||!Number.isSafeInteger(offset)||offset<0)throw new Error('INVALID_SOURCE_POSITION');const e=(await this.conversation.entries({minEntryId:id,maxEntryId:id},1,undefined,context)).items[0];const m=e?.model?.[messageIndex];if(!e||String(e.id)!==entryId||!m||(m.role!=='user'&&m.role!=='assistant'))throw new Error('HISTORY_SOURCE_UNAVAILABLE');const bytes=Buffer.from(messageText(m));if(bytes.length>67108864||offset>bytes.length||offset<bytes.length&&(bytes[offset]!&0xc0)===0x80)throw new Error('INVALID_SOURCE_POSITION');let end=Math.min(bytes.length,offset+32768);while(end<bytes.length&&(bytes[end]!&0xc0)===0x80)end--;return{conversationId:this.id,entryId,messageIndex,offset,text:bytes.subarray(offset,end).toString(),truncated:false,...(end<bytes.length?{nextOffset:end}:{})};
 }
}
