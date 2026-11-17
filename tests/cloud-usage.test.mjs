import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {makeServer} from '../server/app.mjs';
import {createUser} from '../server/auth.mjs';
import {beginUsage,finishUsage,getUsage} from '../server/usage.mjs';
import {at} from '../lib/planner.ts';
const pg=new PGlite();await pg.exec(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));const db={query:(sql,params)=>pg.query(sql,params)};
const alice=await createUser(db,'usage-a@example.test','test-password-alice','甲'),bob=await createUser(db,'usage-b@example.test','test-password-bobby','乙');let resultStatus=200;
const server=await makeServer({db,env:{APP_ORIGIN:'http://localhost'},invokeLLM:async(req,env,observe)=>{if(req.method==='GET')return Response.json({configured:true});observe({providerCalled:true,promptTokens:100,completionTokens:25,totalTokens:125});return Response.json(resultStatus===200?{tasks:[]}:{error:'不可用'},{status:resultStatus});}});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
const call=(path,cookie,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
const login=async(email,password)=>(await call('/api/auth/login',null,{email,password})).headers.get('set-cookie').split(';')[0];const a=await login(alice.email,'test-password-alice'),b=await login(bob.email,'test-password-bobby');
test.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pg.close();});
test('usage is authenticated and status checks do not incur usage',async()=>{assert.equal((await call('/api/usage')).status,401);await call('/api/plan',a);assert.equal((await(await call('/api/usage',a)).json()).today.requests,0);});
test('request metadata and tokens are persisted and isolated per account',async()=>{
 assert.equal((await call('/api/plan',a,{text:'私人任务不应写入统计',today:'2026-10-15'})).status,200);
 // Finalization can complete just after the HTTP response is delivered.
 for(let n=0;n<20;n++){const row=(await db.query('SELECT outcome FROM shixu_ai_usage WHERE user_id=$1',[alice.id])).rows[0];if(row?.outcome==='success')break;await new Promise(r=>setTimeout(r,10));}
 const stats=await(await call('/api/usage',a)).json(),other=await(await call('/api/usage?userId='+alice.id,b)).json();assert.equal(stats.today.requests,1);assert.equal(stats.today.succeeded,1);assert.equal(stats.today.total_tokens,125);assert.equal(other.today.requests,0);assert.equal(stats.recent[0].model,'kimi-k3');assert.ok(!JSON.stringify(stats).includes('私人任务'));
});
test('failed provider requests count separately and retain known tokens',async()=>{resultStatus=502;await call('/api/plan',a,{text:'失败请求',today:'2026-10-15'});for(let n=0;n<20;n++){const usage=await getUsage(db,alice.id);if(usage.today.failed===1){assert.equal(usage.today.total_tokens,250);return;}await new Promise(r=>setTimeout(r,10));}assert.fail('usage not finalized');});
test('day and month cutoffs use Beijing time; missing usage remains unknown',async()=>{
 const id=await beginUsage(db,bob.id,'kimi-k3');await finishUsage(db,id,504,60000,{providerCalled:true});await db.query('UPDATE shixu_ai_usage SET created_at=$2 WHERE id=$1',[id,'2026-10-14T16:01:00Z']);
 const previous=await beginUsage(db,bob.id,'kimi-k3');await finishUsage(db,previous,200,1,{providerCalled:true,totalTokens:20});await db.query('UPDATE shixu_ai_usage SET created_at=$2 WHERE id=$1',[previous,'2026-10-14T15:59:00Z']);
 const stats=await getUsage(db,bob.id,at('2026-10-15','09:00'));assert.equal(stats.today.requests,1);assert.equal(stats.today.failed,1);assert.equal(stats.today.provider_calls,1);assert.equal(stats.today.metered_calls,0);assert.equal(stats.recent.find(item=>item.http_status===504).total_tokens,null);assert.equal(stats.month.requests,2);assert.equal(stats.month.total_tokens,20);
});
