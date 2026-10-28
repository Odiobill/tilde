import type{AgentSession}from'@tilde/agent';import type{SelectedView,ActivityPage}from'@tilde/protocol';
export type WorkspaceEvent={kind:'replace'|'update';view:SelectedView};
export interface WorkspaceSource{snapshot():Promise<SelectedView>;watch(listener:(event:WorkspaceEvent)=>void):Promise<{snapshot:SelectedView;stop():Promise<void>}>}
export function combinedSource(agent:AgentSession,conversationId:string):WorkspaceSource{
 const service=agent.conversations;if(!service)throw new Error('CONVERSATIONS_UNAVAILABLE');const activity=():Promise<ActivityPage>=>agent.tooling?.activity.list(conversationId)??Promise.resolve({conversationId,revision:'0',operations:[]});
 const snapshot=async():Promise<SelectedView>=>{await service.authorize(conversationId);return{chat:await service.snapshot(conversationId),activity:await activity(),work:await service.work()};};
 return{snapshot,async watch(listener){let stopped=false,armed=false,version=0,queued=false,line=Promise.resolve(),last:SelectedView|undefined;const refresh=()=>{version++;if(!armed||stopped||queued)return;queued=true;line=line.then(async()=>{queued=false;if(stopped)return;try{const view=await snapshot();last=view;if(!stopped)listener({kind:'update',view});}catch{if(last&&!stopped){const work=await service.work();if(work.status==='storage_failed')listener({kind:'update',view:{...last,chat:{...last.chat,state:'blocked',errorCode:'STORAGE_FAILED'},work}});}}});};
  const chatWatch=await service.watch(conversationId,refresh);let toolWatch:Awaited<ReturnType<NonNullable<AgentSession['tooling']>['broker']['watchInspection']>>|undefined;let unwatchBudget:(()=>void)|undefined;
  try{toolWatch=await agent.tooling?.broker.watchInspection(refresh);unwatchBudget=agent.budgets?.watch(refresh);for(let attempts=0;attempts<3;attempts++){const before=version;last=await snapshot();if(before===version)break;}armed=true;return{snapshot:last!,async stop(){if(stopped)return;stopped=true;toolWatch?.stop();unwatchBudget?.();await chatWatch.stop();await line;}};}catch(e){stopped=true;toolWatch?.stop();unwatchBudget?.();await chatWatch.stop();await line;throw e;}
 }};
}
