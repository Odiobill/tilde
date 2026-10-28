import{randomUUID}from'node:crypto';import type{WorkspaceSource}from'./tool-subscriptions.js';import type{V4ServerFrame,SelectedView,CatalogQuery,CatalogPage,WorkState,RuntimeSettings}from'@tilde/protocol';import type{ConversationService}from'@tilde/agent';
type Attachment<T>={snapshot:T;stop():Promise<void>};
class WatchLane<T>{
 private generation=0;private stopWatch:(()=>Promise<void>)|undefined;private acquisitions=new Set<Promise<unknown>>();
 constructor(private epoch:string,private alive:()=>boolean,private send:(frame:V4ServerFrame)=>boolean,private event:(snapshot:boolean,subscriptionId:string,seq:string,value:T)=>V4ServerFrame){}
 async attach(acquire:(changed:(value:T)=>void)=>Promise<Attachment<T>>):Promise<{subscriptionId:string;value:T;afterSend():void}>{const generation=++this.generation;await this.stopWatch?.();this.stopWatch=undefined;let subscriptionId=randomUUID(),seq=0n,delivering=false,pending:V4ServerFrame[]=[],pendingBytes=0;const initialId=subscriptionId;
  const update=(value:T)=>{if(generation!==this.generation||!this.alive())return;let frame:V4ServerFrame;if(pending.length>=128||pendingBytes+Buffer.byteLength(JSON.stringify(value))>4190000){subscriptionId=randomUUID();seq=0n;pending=[];pendingBytes=0;frame=this.event(true,subscriptionId,'0',value);}else frame=this.event(false,subscriptionId,String(++seq),value);if(delivering)this.send(frame);else{pending.push(frame);pendingBytes+=Buffer.byteLength(JSON.stringify(frame));}};
  const acquisition=acquire(update);this.acquisitions.add(acquisition);let watch:Attachment<T>;try{watch=await acquisition;}finally{this.acquisitions.delete(acquisition);}if(generation!==this.generation||!this.alive()){await watch.stop();throw new Error('CLIENT_CLOSED');}this.stopWatch=()=>watch.stop();return{subscriptionId:initialId,value:watch.snapshot,afterSend:()=>{if(generation!==this.generation||!this.alive())return;delivering=true;for(const frame of pending)this.send(frame);pending=[];pendingBytes=0;}};
 }
 async close(){this.generation++;const stop=this.stopWatch;this.stopWatch=undefined;await stop?.();await Promise.allSettled([...this.acquisitions]);}
}
export class Subscription{
 private lane:WatchLane<SelectedView>;
 constructor(private source:(cid:string)=>WorkspaceSource,private epoch:string,private settings:()=>RuntimeSettings,send:(f:V4ServerFrame)=>boolean,alive:()=>boolean){this.lane=new WatchLane(epoch,alive,send,(snapshot,subscriptionId,seq,view)=>snapshot?{v:4,event:'conversation.snapshot',epoch,subscriptionId,seq:'0',view,settings:this.settings()}:{v:4,event:'conversation.updated',epoch,subscriptionId,seq,view});}
 async attach(conversationId:string){const attached=await this.lane.attach(changed=>this.source(conversationId).watch(e=>changed(e.view)));return{result:{epoch:this.epoch,subscriptionId:attached.subscriptionId,seq:'0' as const,view:attached.value,settings:this.settings()},afterSend:attached.afterSend};}
 close(){return this.lane.close();}
}
export class CatalogSubscription{
 private lane:WatchLane<{page:CatalogPage;work:WorkState}>;
 constructor(private service:ConversationService,private epoch:string,send:(f:V4ServerFrame)=>boolean,alive:()=>boolean){this.lane=new WatchLane(epoch,alive,send,(snapshot,subscriptionId,seq,value)=>snapshot?{v:4,event:'conversations.snapshot',epoch,subscriptionId,seq:'0',...value}:{v:4,event:'conversations.updated',epoch,subscriptionId,seq,...value});}
 async attach(query:CatalogQuery){const attached=await this.lane.attach(async changed=>{const watch=await this.service.watchCatalog(query,changed);return{snapshot:{page:watch.page,work:watch.work},stop:watch.stop};});return{result:{epoch:this.epoch,subscriptionId:attached.subscriptionId,seq:'0' as const,...attached.value},afterSend:attached.afterSend};}
 close(){return this.lane.close();}
}
