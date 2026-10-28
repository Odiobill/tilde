import {test} from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import {validateV2Request,validateV2ServerFrame} from './m2.js';
const operation={id:'op',conversationId:'c',tool:'shell_run',fingerprint:'f',risk:'unrestricted_shell',status:'awaiting_approval',createdAt:10,attempt:0,summary:'run script',targets:['/work'],output:'',truncated:false,approvalExpiresAt:600010,approvalId:'a'};
const frame=(result:unknown)=>({v:2,id:'r',epoch:'e',ok:true,result});
const workspace={chat:{conversationId:'c',entries:[],olderEntries:false,state:'idle'},tools:{revision:'r',status:'waiting_for_approval',operations:[operation],olderOperations:false}};
// Break caught: v1/forged fields, oversized UTF8/bulk rows or incomplete details gain acceptance.
test('v2 bounds approvals and rejects v1 mutations',async()=>{
 const fixtures=JSON.parse(await readFile(new URL('../fixtures/wire-v2.json',import.meta.url),'utf8'));
 for(const f of fixtures)assert.equal(f.direction==='request'?validateV2Request(f.value):validateV2ServerFrame(f.value),f.valid,f.name);
 const request={v:2,id:'r',method:'approvals.decide',params:{decisionId:'d',operationId:'op',fingerprint:'f',decision:'approve_once'}};
 assert.equal(validateV2Request(request),true);assert.equal(validateV2Request({...request,v:1}),false);assert.equal(validateV2Request({...request,params:{...request.params,actorUid:123}}),false);
 assert.equal(validateV2ServerFrame(frame(workspace)),true);
 assert.equal(validateV2ServerFrame(frame({revision:'r',approvals:Array(17).fill(operation)})),false);
 assert.equal(validateV2ServerFrame(frame({...workspace,tools:{...workspace.tools,operations:[{...operation,summary:'é'.repeat(257)}]}})),false);
 assert.equal(validateV2ServerFrame(frame({...workspace,tools:{...workspace.tools,operations:Array(64).fill({...operation,output:'x'.repeat(4096)})}})),false);
 assert.equal(createHash('sha256').update(await readFile(new URL('../fixtures/wire-v1.json',import.meta.url))).digest('hex'),'d3c7322eecdfbecd44fec37a0da34b7272f861bb3913879aaae837bd52c14873');
});
test('approval detail preserves full action',()=>{
 for(const request of [{tool:'shell_run',args:{script:'x'.repeat(16384),cwd:'/work'}},{tool:'fs_patch',args:{path:'/work/a',expectedSha256:'a'.repeat(64),search:'x'.repeat(65536),replacement:'y'.repeat(65536)}}]){
  const detail={operationId:'op',fingerprint:'f',request,risk:'unrestricted_shell',expiresAt:600000};assert.ok(Buffer.byteLength(JSON.stringify(detail))<=196608);assert.equal(validateV2ServerFrame(frame(JSON.parse(JSON.stringify(detail)))),true);
  assert.equal(validateV2ServerFrame(frame({...detail,request:{summary:'truncated...'}})),false);
 }
 assert.equal(validateV2ServerFrame(frame({operationId:'op',fingerprint:'f',request:{tool:'shell_run',args:{script:'é'.repeat(8193),cwd:'/work'}},risk:'unrestricted_shell',expiresAt:10})),false);
});
test('canonical request cannot exceed complete approval transport',async()=>{
 const {validateToolRequest}=await import('./m2.js');assert.equal(validateToolRequest({tool:'fs_patch',args:{path:'/work/a',expectedSha256:'a'.repeat(64),search:'\u0001'.repeat(65536),replacement:'\u0002'.repeat(65536)}}),false);
});
