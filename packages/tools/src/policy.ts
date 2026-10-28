import type{PreparedOperation,PolicyDecision}from'./types.js';
export function classify(p:PreparedOperation):PolicyDecision{
 if(p.request.tool==='shell_run')return{kind:'approval',risk:'unrestricted_shell',reasonCode:'EXACT_SHELL_APPROVAL'};
 if(p.highRisk)return{kind:'approval',risk:'high',reasonCode:'HIGH_RISK_EDIT'};
 return{kind:'allow',risk:'ordinary',reasonCode:'ORDINARY_TARGETED_ACTION'};
}
