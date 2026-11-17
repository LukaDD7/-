import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {makeServer} from '../server/app.mjs';
import {createUser} from '../server/auth.mjs';
import {emptyState} from '../lib/planner.ts';
const pg=new PGlite();await pg.exec(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));
const db={query:(text,params)=>pg.query(text,params)};
const alice=await createUser(db,'alice@example.test','test-password-alice','甲');
const bob=await createUser(db,'bob@example.test','test-password-bobby','乙');
const server=await makeServer({db,env:{APP_ORIGIN:'https://planner.example.test'},invokeLLM:async()=>new Response(JSON.stringify({configured:true,tasks:[]}),{headers:{'Content-Type':'application/json'}})});
server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
async function call(path,{method='GET',cookie,body,headers={}}={}){return fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}
async function login(email,password){const r=await call('/api/auth/login',{method:'POST',body:{email,password}});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const aliceCookie=await login(alice.email,'test-password-alice'),bobCookie=await login(bob.email,'test-password-bobby');
test.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await pg.close();});
test('unauthenticated data and model endpoints require login',async()=>{for(const p of ['/api/state','/api/plan','/api/auth/me'])assert.equal((await call(p)).status,401);});
test('sessions use HttpOnly secure cookies and hashed storage',async()=>{const r=await call('/api/auth/login',{method:'POST',body:{email:alice.email,password:'test-password-alice'}});const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);const rows=(await db.query('SELECT token_hash FROM shixu_sessions')).rows;assert.ok(rows.every(x=>/^[a-f0-9]{64}$/.test(x.token_hash)));assert.ok(rows.every(x=>!cookie.includes(x.token_hash)));});
test('cross-origin writes and model calls are rejected',async()=>{for(const path of ['/api/state','/api/plan'])assert.equal((await call(path,{cookie:aliceCookie,method:path==='/api/state'?'PUT':'POST',body:{},headers:{Origin:'https://foreign.example'}})).status,403);});
test('cloud state is isolated by authenticated user rather than body user ID',async()=>{let r=await call('/api/state',{cookie:aliceCookie});const data=await r.json();const state=emptyState();state.events=[{id:'private',title:'甲的私人日程',start:1,end:2}];r=await call('/api/state',{cookie:aliceCookie,method:'PUT',body:{revision:data.revision,state,userId:bob.id}});assert.equal(r.status,200);const a=await(await call('/api/state',{cookie:aliceCookie})).json(),b=await(await call('/api/state',{cookie:bobCookie})).json();assert.equal(a.state.events[0].title,'甲的私人日程');assert.equal(b.state.events.length,0);});
test('simultaneous edits accept only one matching revision',async()=>{const data=await(await call('/api/state',{cookie:aliceCookie})).json();const one={...data.state,events:[]},two={...data.state,events:[{id:'new',title:'另一设备',start:3,end:4}]};const results=await Promise.all([call('/api/state',{cookie:aliceCookie,method:'PUT',body:{revision:data.revision,state:one}}),call('/api/state',{cookie:aliceCookie,method:'PUT',body:{revision:data.revision,state:two}})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);});
test('invalid snapshot and invalid login inputs return controlled errors',async()=>{assert.equal((await call('/api/state',{cookie:bobCookie,method:'PUT',body:{revision:0,state:{version:1}}})).status,400);assert.equal((await call('/api/auth/login',{method:'POST',body:{email:bob.email,password:'incorrect'}})).status,401);});
test('authenticated model calls use the same protected backend',async()=>{assert.equal((await call('/api/plan',{cookie:aliceCookie,method:'POST',body:{text:'整理任务',today:'2026-10-13'}})).status,200);});
test('logout invalidates the stored session',async()=>{assert.equal((await call('/api/auth/logout',{cookie:bobCookie,method:'POST',body:{}})).status,200);assert.equal((await call('/api/state',{cookie:bobCookie})).status,401);});
test('HTTP storage preserves start and deadline clocks and rejects malformed clocks',async()=>{
 const current=await(await call('/api/state',{cookie:aliceCookie})).json();const state=emptyState();
 state.tasks=[{id:'window',title:'明天下午开始',minutes:60,deadline:'2026-10-14',deadlineTime:'15:00',notBefore:'2026-10-14',notBeforeTime:'14:00',priority:'medium',category:'work',splittable:false,completed:false,locked:false,recurrence:'none',notes:''}];
 const saved=await call('/api/state',{cookie:aliceCookie,method:'PUT',body:{revision:current.revision,state}});assert.equal(saved.status,200);
 const read=await(await call('/api/state',{cookie:aliceCookie})).json();assert.equal(read.state.tasks[0].notBeforeTime,'14:00');assert.equal(read.state.tasks[0].deadlineTime,'15:00');
 const invalid={...state,tasks:[{...state.tasks[0],notBeforeTime:'25:00'}]};assert.equal((await call('/api/state',{cookie:aliceCookie,method:'PUT',body:{revision:read.revision,state:invalid}})).status,400);
 const unchanged=await(await call('/api/state',{cookie:aliceCookie})).json();assert.equal(unchanged.revision,read.revision);assert.equal(unchanged.state.tasks[0].notBeforeTime,'14:00');
});

test('progress round-trip preserves total effort and rejects invalid changes without losing prior data',async()=>{
 const current=await(await call('/api/state',{cookie:aliceCookie})).json();const state={...current.state,tasks:current.state.tasks.map(task=>({...task,minutes:120,workedMinutes:60}))};
 assert.equal((await call('/api/state',{cookie:aliceCookie,method:'PUT',body:{revision:current.revision,state}})).status,200);
 const saved=await(await call('/api/state',{cookie:aliceCookie})).json();assert.equal(saved.state.tasks[0].minutes,120);assert.equal(saved.state.tasks[0].workedMinutes,60);
 const bad={...state,tasks:state.tasks.map(task=>({...task,workedMinutes:125}))};assert.equal((await call('/api/state',{cookie:aliceCookie,method:'PUT',body:{revision:saved.revision,state:bad}})).status,400);
 const unchanged=await(await call('/api/state',{cookie:aliceCookie})).json();assert.equal(unchanged.revision,saved.revision);assert.equal(unchanged.state.tasks[0].workedMinutes,60);
});
