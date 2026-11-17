import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudSync} from '../lib/cloud-sync.ts';
import {emptyState} from '../lib/planner.ts';
const altered=(title:string)=>({...emptyState(),events:[{id:title,title,start:1,end:2}]});
test('edits during an in-flight save are queued with the next revision',async()=>{let release:(x:any)=>void=()=>{};const calls:any[]=[];const c=new CloudSync({state:emptyState(),revision:0},async(_method,body)=>{calls.push(body);if(calls.length===1)return new Promise(r=>release=r);return {status:200,data:{revision:2}};},()=>{});c.mark(altered('one'));const flush=c.flush();c.mark(altered('two'));release({status:200,data:{revision:1}});await flush;assert.equal(calls.length,2);assert.equal(calls[1].revision,1);assert.equal(calls[1].state.events[0].title,'two');assert.equal(c.dirty,false);c.dispose();});
test('version conflicts keep local changes and never retry an overwrite automatically',async()=>{let calls=0;const c=new CloudSync({state:emptyState(),revision:0},async()=>{calls++;return{status:409,data:{}};},()=>{});c.mark(altered('local'));await c.flush();assert.equal(c.status,'conflict');await c.flush();assert.equal(calls,1);assert.equal(c.state.events[0].title,'local');c.dispose();});
test('a remote refresh cannot replace edits made while the request is in flight',async()=>{let release:(x:any)=>void=()=>{};const c=new CloudSync({state:emptyState(),revision:0},async()=>new Promise(r=>release=r),()=>{});const pulling=c.pull();c.mark(altered('local'));release({status:200,data:{revision:1,state:altered('remote')}});await pulling;assert.equal(c.state.events[0].title,'local');assert.equal(c.revision,0);c.dispose();});
test('offline saves preserve unsynced state for a retry',async()=>{let fail=true;const c=new CloudSync({state:emptyState(),revision:0},async()=>{if(fail)throw new Error('offline');return{status:200,data:{revision:1}};},()=>{});c.mark(altered('pending'));await c.flush();assert.equal(c.status,'offline');assert.equal(c.dirty,true);fail=false;await c.flush();assert.equal(c.status,'saved');assert.equal(c.dirty,false);c.dispose();});
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(condition:()=>boolean){const deadline=Date.now()+2000;while(!condition()){if(Date.now()>deadline)throw new Error('Timed out waiting for sync');await wait(5);}}
test('unsaved edits retry automatically after connection recovers',async()=>{
 let fail=true,calls=0;const c=new CloudSync({state:emptyState(),revision:0},async()=>{calls++;if(fail)throw new Error('offline');return{status:200,data:{revision:1}};},()=>{},{retryDelays:[10,20]});
 try{c.mark(altered('pending'));await c.flush();assert.equal(c.status,'offline');fail=false;await until(()=>c.status==='saved');assert.ok(calls>=2);assert.equal(c.state.events[0].title,'pending');assert.equal(c.dirty,false);}finally{c.dispose();}
});
test('automatic retries stop on a conflict or expired session',async()=>{
 for(const status of [409,401]){let calls=0;const c=new CloudSync({state:emptyState(),revision:0},async()=>{if(++calls===1)throw new Error('offline');return{status,data:{}};},()=>{},{retryDelays:[5]});try{c.mark(altered('local'));await c.flush();await until(()=>c.status===(status===409?'conflict':'expired'));await wait(30);assert.equal(calls,2);assert.equal(c.dirty,true);}finally{c.dispose();}}
});
test('rejected input keeps local state and is not retried endlessly',async()=>{
 let calls=0;const c=new CloudSync({state:emptyState(),revision:0},async()=>{calls++;return{status:400,data:{}};},()=>{},{retryDelays:[5]});try{c.mark(altered('local'));await c.flush();await wait(30);assert.equal(c.status,'rejected');assert.equal(calls,1);assert.equal(c.dirty,true);}finally{c.dispose();}
});
test('disposing an offline client cancels pending retries',async()=>{
 let calls=0;const c=new CloudSync({state:emptyState(),revision:0},async()=>{calls++;throw new Error('offline');},()=>{},{retryDelays:[5]});c.mark(altered('local'));await c.flush();c.dispose();await wait(30);assert.equal(calls,1);
});
test('failure while resolving a conflict never starts an automatic overwrite',async()=>{
 const c=new CloudSync({state:emptyState(),revision:0},async()=>{throw new Error('offline');},()=>{},{retryDelays:[5]});try{c.mark(altered('local'));c.conflict();await c.resolve(true);assert.equal(c.status,'conflict');assert.equal(c.state.events[0].title,'local');}finally{c.dispose();}
});
