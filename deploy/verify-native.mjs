import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {createUser} from '../server/auth.mjs';
const config=JSON.parse(await readFile('/etc/shixu/bootstrap.json','utf8'));
const db=new pg.Pool({host:'127.0.0.1',port:5433,database:'shixu',user:'shixu',password:config.databasePassword,max:2});
const origin='http://127.0.0.1:8080';
async function call(path,{cookie,method='GET',body}={}){return fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(70000)});}
const summary={};
try{
 assert.equal((await call('/api/health')).status,200);summary.databaseHealthy=true;
 assert.equal((await call('/api/state')).status,401);summary.loginRequired=true;
 const password=randomBytes(24).toString('base64url');
 const check=await createUser(db,`check-${Date.now()}@shixu.local`,password,'部署验证');
 const login=await call('/api/auth/login',{method:'POST',body:{email:check.email,password}});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const plan=await(await call('/api/state',{cookie})).json();
 const start=Date.now()+3600000;plan.state.events=[{id:'cloud-check',title:'云端连接验证',start,end:start+1800000}];
 const saved=await call('/api/state',{cookie,method:'PUT',body:{revision:plan.revision,state:plan.state}});assert.equal(saved.status,200);const revision=(await saved.json()).revision;
 const stored=(await db.query('SELECT state_json FROM shixu_plans WHERE user_id=$1',[check.id])).rows[0];assert.equal(stored.state_json.events[0].title,'云端连接验证');summary.httpSavePersisted=true;
 const attempts=await Promise.all([call('/api/state',{cookie,method:'PUT',body:{revision,state:plan.state}}),call('/api/state',{cookie,method:'PUT',body:{revision,state:plan.state}})]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);summary.concurrentEditProtected=true;
 const ownerLogin=await call('/api/auth/login',{method:'POST',body:{email:config.owner.email,password:config.owner.password}});assert.equal(ownerLogin.status,200);const ownerCookie=ownerLogin.headers.get('set-cookie').split(';')[0];
 const ownerPlan=await(await call('/api/state',{cookie:ownerCookie})).json();assert.equal(ownerPlan.state.events.length,0);summary.accountsIsolated=true;
 const status=await(await call('/api/plan',{cookie})).json();assert.equal(status.configured,true);summary.llmConfigured=true;
 const model=await call('/api/plan',{cookie,method:'POST',body:{text:'明天完成一份产品需求草案，先梳理需求30分钟，再撰写60分钟。',today:new Date().toISOString().slice(0,10)}});assert.equal(model.status,200);const draft=await model.json();assert.ok(draft.tasks?.length>0);summary.llmRoundTrip={model:draft.model,tasks:draft.tasks.length};
 await call('/api/auth/logout',{cookie,method:'POST',body:{}});assert.equal((await call('/api/state',{cookie})).status,401);summary.logoutInvalidatesSession=true;
 await call('/api/auth/logout',{cookie:ownerCookie,method:'POST',body:{}});
 console.log(JSON.stringify(summary));
}catch(error){console.error('Deployment verification failed. '+(error.code||error.name||'unknown'));process.exitCode=1;}finally{await db.end();}
