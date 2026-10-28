import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider,fauxAssistantMessage,fauxToolCall,fauxThinking } from '@earendil-works/pi-ai/providers/faux';
export function scripted(mode:'slow'|'error'|'tool'|'thinking'|'empty'='slow'){
 const faux=fauxProvider({provider:'opencode-go',models:[{id:'deepseek-v4.1-flash'},{id:'other'},{id:'glm-5.2'}],tokensPerSecond:20,tokenSize:{min:2,max:2}});
 const message=mode==='empty'?fauxAssistantMessage(''):mode==='thinking'?fauxAssistantMessage(fauxThinking('internal fixture reasoning only'),{stopReason:'length'}):mode==='error'?fauxAssistantMessage('',{stopReason:'error',errorMessage:'agent-synthetic-canary'}):mode==='tool'?fauxAssistantMessage(fauxToolCall('shell',{command:'touch /tmp/forbidden-tilde-effect'}),{stopReason:'toolUse'}):fauxAssistantMessage('streamed fixture response with several updates');
 faux.setResponses(Array.from({length:20},()=>message));const models=createModels();models.setProvider(faux.provider);return {models,faux};
}
