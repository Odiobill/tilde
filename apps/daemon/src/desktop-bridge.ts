import{spawn,type ChildProcessWithoutNullStreams}from'node:child_process';import{fileURLToPath}from'node:url';import{resolve}from'node:path';import type{DesktopPort,NoticeInput}from'./notifications.js';import type{WorkState}from'@tilde/protocol';import{validDesktopInput,validDesktopOutput,type DesktopOutput}from'./desktop-protocol.js';
import{installedExecutables}from'./install-paths.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export const desktopExecutables=installedExecutables??Object.freeze({helper:resolve(root,'.build/cmake/apps/desktop-bridge/tilde-desktop-bridge'),frontend:resolve(root,'.build/cmake/apps/gui/tilde-gui')});
export function launchDesktopConversation(cid?:string):void{const args=cid&&/^[1-9][0-9]{0,63}$/.test(cid)?['--open-conversation',cid]:[];const child=spawn(desktopExecutables.frontend,args,{shell:false,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}
export type DesktopBridgeOptions={spawnChild?:()=>ChildProcessWithoutNullStreams};type Status=WorkState['desktopStatus'];type Result='delivered'|'unavailable'|'failed';type Job={input:NoticeInput;resolve:(r:Result)=>void};
export class DesktopBridge implements DesktopPort{
 private child?:ChildProcessWithoutNullStreams;private exit?:Promise<void>;private starting?:Promise<boolean>;private resolveReady?:((available:boolean)=>void);private readyTimer?:NodeJS.Timeout;private resultTimer?:NodeJS.Timeout;private incoming=Buffer.alloc(0);private queue:Job[]=[];private active?:Job;private owner='';private available=false;private actions=false;private ready=false;private closing?:Promise<void>;private delivered=new Map<string,string>();private opens=new Set<(id:string)=>void>();private statuses=new Set<(s:Status)=>void>();private currentStatus:Status='disabled';
 constructor(private readonly options:DesktopBridgeOptions={}){}
 onOpen(fn:(id:string)=>void){this.opens.add(fn);return()=>{this.opens.delete(fn);};}onStatus(fn:(s:Status)=>void){this.statuses.add(fn);return()=>{this.statuses.delete(fn);};}
 private status(s:Status){if(s===this.currentStatus)return;this.currentStatus=s;for(const fn of this.statuses)fn(s);}
 private finish(r:Result){clearTimeout(this.resultTimer);const job=this.active;this.active=undefined;job?.resolve(r);}
 private drop(r:Result){this.finish(r);for(const job of this.queue.splice(0))job.resolve(r);}
 private fail(){this.available=false;this.ready=false;this.delivered.clear();this.resolveReady?.(false);this.resolveReady=undefined;clearTimeout(this.readyTimer);this.drop('failed');this.status('failed');void this.close();}
 async start():Promise<boolean>{if(this.closing)await this.closing;if(this.child&&this.ready&&this.available)return true;if(this.starting)return this.starting;if(this.child)await this.close();
  const starting=new Promise<boolean>(resolveReady=>{this.resolveReady=resolveReady;this.ready=false;this.owner='';this.available=false;this.actions=false;this.incoming=Buffer.alloc(0);
   let child:ChildProcessWithoutNullStreams;try{child=this.options.spawnChild?.()??spawn(desktopExecutables.helper,[],{shell:false,stdio:['pipe','pipe','pipe']});}catch{this.resolveReady=undefined;this.status('failed');resolveReady(false);return;}
   this.child=child;this.exit=new Promise<void>(resolveExit=>child.once('close',()=>{resolveExit();if(this.child===child){this.child=undefined;this.ready=false;this.available=false;this.delivered.clear();this.resolveReady?.(false);this.resolveReady=undefined;clearTimeout(this.readyTimer);this.drop('failed');if(!this.closing)this.status('failed');}}));
   child.stdin.on('error',()=>{if(this.child===child&&!this.closing)this.fail();});child.on('error',()=>{if(this.child===child&&!this.closing)this.fail();});child.stderr.resume();
   child.stdout.on('data',(bytes:Buffer)=>{if(this.child!==child||this.closing)return;for(const byte of bytes){if(byte===10){try{const value:unknown=JSON.parse(this.incoming.toString('utf8'));this.incoming=Buffer.alloc(0);if(!validDesktopOutput(value)){this.fail();return;}this.frame(value);}catch{this.fail();return;}}else{if(this.incoming.length>=4096){this.fail();return;}this.incoming=Buffer.concat([this.incoming,Buffer.from([byte])]);}}});
   this.readyTimer=setTimeout(()=>this.fail(),2500);
  });this.starting=starting;try{return await starting;}finally{if(this.starting===starting)this.starting=undefined;}
 }
 private frame(f:DesktopOutput){if(f.event==='ready'){if(f.ownerRevision!==this.owner){this.delivered.clear();if(this.owner){this.drop('failed');}this.owner=f.ownerRevision;}this.ready=true;this.available=f.available;this.actions=f.actions;clearTimeout(this.readyTimer);this.resolveReady?.(f.available);this.resolveReady=undefined;this.status(f.available?'ready':'unavailable');if(!f.available)this.drop('unavailable');else this.pump();return;}
  if(!this.ready||f.ownerRevision!==this.owner)return;
  if(f.event==='result'){if(this.active?.input.id!==f.id)return;const result=f.status;if(result==='delivered'&&this.actions){if(this.delivered.size>=16)this.delivered.delete(this.delivered.keys().next().value!);this.delivered.set(f.id,f.ownerRevision);}this.finish(result);this.pump();return;}
  if(this.available&&this.actions&&this.delivered.get(f.id)===f.ownerRevision){this.delivered.delete(f.id);for(const fn of this.opens)fn(f.id);}
 }
 async notify(input:NoticeInput):Promise<Result>{if(!validDesktopInput(input))return'failed';if(!this.child||!this.ready||!this.available){if(!await this.start())return'unavailable';}if(this.closing||!this.child||!this.available)return'unavailable';if(this.queue.length+(this.active?1:0)>=16)return'unavailable';return new Promise<Result>(resolve=>{this.queue.push({input,resolve});this.pump();});}
 private pump(){if(this.closing||this.active||!this.available||!this.child)return;const job=this.queue.shift();if(!job)return;this.active=job;const line=JSON.stringify(job.input)+'\n';this.resultTimer=setTimeout(()=>this.fail(),2500);if(this.child.stdin.writableLength>65536||!this.child.stdin.writable){this.fail();return;}this.child.stdin.write(line,e=>{if(e)this.fail();});}
 close():Promise<void>{if(this.closing)return this.closing;const child=this.child,exit=this.exit;this.ready=false;this.available=false;this.delivered.clear();clearTimeout(this.readyTimer);this.resolveReady?.(false);this.resolveReady=undefined;this.drop('failed');if(!child)return Promise.resolve();
  this.closing=(async()=>{child.stdin.end();const term=setTimeout(()=>child.kill('SIGTERM'),300),kill=setTimeout(()=>child.kill('SIGKILL'),600);try{await exit;}finally{clearTimeout(term);clearTimeout(kill);if(this.child===child)this.child=undefined;this.incoming=Buffer.alloc(0);this.closing=undefined;}})();return this.closing;
 }
}
