import test from 'node:test';
import assert from 'node:assert/strict';
import {llmResponse} from '../lib/llm-service.ts';
const env={BOYU_API_KEY:'unit-test-not-a-key',BOYU_API_BASE:'https://example.invalid/v1/',BOYU_MODEL:'kimi-k3'};
const request=(text='周五前写完需求文档')=>new Request('http://localhost:5173/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,today:'2026-10-13'})});
const draft={title:'梳理需求',minutes:60,deadline:'2026-10-16',priority:'medium',category:'work',splittable:true,notes:'形成需求清单',dependsOn:[]};
test('missing credentials returns a clear unavailable status',async()=>{const r=await llmResponse(request(),{});assert.equal(r.status,503);});
test('cross-origin inference calls are rejected',async()=>{const r=await llmResponse(new Request('http://localhost:5173/api/plan',{method:'POST',headers:{origin:'https://foreign.invalid'},body:'{}'}),env);assert.equal(r.status,403);});
test('malformed input never calls the model',async()=>{const r=await llmResponse(request('x'),env);assert.equal(r.status,400);});
test('structured model output preserves explicit dependency order',async()=>{const original=globalThis.fetch;let sent:any;globalThis.fetch=async(_url,init)=>{sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'先梳理再写作',tasks:[draft,{...draft,title:'撰写文档',dependsOn:[0]}]})}}]}));};try{const r=await llmResponse(request(),env);assert.equal(r.status,200);const data=await r.json() as any;assert.deepEqual(data.tasks[1].dependsOn,[0]);assert.equal(sent.model,'kimi-k3');assert.equal(sent.temperature,1);}finally{globalThis.fetch=original;}});
test('invalid model dates and forward dependencies are rejected',async()=>{const original=globalThis.fetch;try{for(const bad of [{...draft,deadline:'2026-02-30'},{...draft,dependsOn:[1]}]){globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'草案',tasks:[bad]})}}]}));assert.equal((await llmResponse(request(),env)).status,502);}}finally{globalThis.fetch=original;}});
test('upstream errors are sanitized and never echo provider response data',async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>new Response('private upstream diagnostic',{status:401});try{const r=await llmResponse(request(),env);assert.equal(r.status,502);assert.ok(!(await r.text()).includes('private upstream diagnostic'));}finally{globalThis.fetch=original;}});
test('model start dates and time windows survive server validation',async()=>{
 const original=globalThis.fetch;let sent:any;const constrained={...draft,notBefore:'2026-10-14',notBeforeTime:'14:00',deadline:'2026-10-14',deadlineTime:'15:00',splittable:false};
 globalThis.fetch=async(_url,init)=>{sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'明天下午执行',tasks:[constrained]})}}]}));};
 try{const r=await llmResponse(request('明天下午两点到三点会议'),env);assert.equal(r.status,200);const data=await r.json() as any;assert.equal(data.tasks[0].notBefore,'2026-10-14');assert.equal(data.tasks[0].notBeforeTime,'14:00');assert.equal(data.tasks[0].deadlineTime,'15:00');assert.match(sent.messages[0].content,/notBeforeTime/);}finally{globalThis.fetch=original;}
});
test('invalid start dates or time fields are rejected without becoming real tasks',async()=>{
 const original=globalThis.fetch;
 try{for(const patch of [{notBefore:'2026-02-30'},{notBeforeTime:'24:00'},{deadlineTime:'12:61'}]){globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'草案',tasks:[{...draft,...patch}]})}}]}));assert.equal((await llmResponse(request(),env)).status,502);}}finally{globalThis.fetch=original;}
});

test('telemetry keeps provider tokens even when returned tasks are invalid',async()=>{
 const original=globalThis.fetch;try{for(const content of [JSON.stringify({summary:'草案',tasks:[draft]}),'invalid-output']){let usage:any;
 globalThis.fetch=async()=>new Response(JSON.stringify({usage:{prompt_tokens:120,completion_tokens:45,total_tokens:165},choices:[{message:{content}}]}));
 const response=await llmResponse(request(),env,event=>{usage=event;});assert.equal(response.status,content==='invalid-output'?502:200);assert.deepEqual(usage,{providerCalled:true,promptTokens:120,completionTokens:45,totalTokens:165});}
 }finally{globalThis.fetch=original;}
});
test('unknown and invalid provider usage is not reported as zero',async()=>{
 const original=globalThis.fetch;try{let usage:any;globalThis.fetch=async()=>new Response(JSON.stringify({usage:{prompt_tokens:-1,completion_tokens:'2'},choices:[{message:{content:JSON.stringify({summary:'草案',tasks:[draft]})}}]}));await llmResponse(request(),env,event=>{usage=event;});assert.deepEqual(usage,{providerCalled:true});}finally{globalThis.fetch=original;}
});
