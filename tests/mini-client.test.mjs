import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {schedule,emptyState,at} from '../lib/planner.ts';
const root=resolve('miniprogram');
function runtime({network,config={apiBase:'https://planner.example.test',version:'test'}}={}){
 const cache=new Map(),storage=new Map(),captured={};const wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,structuredClone(value)),removeStorageSync:key=>storage.delete(key),request:options=>{Promise.resolve().then(()=>network?.(options)||{statusCode:200,data:{}}).then(options.success,options.fail);},login:options=>options.success({code:'fresh-test-code'}),showToast:()=>{},showModal:()=>{},switchTab:()=>{},navigateTo:()=>{},navigateBack:()=>{},env:{USER_DATA_PATH:'/private-test'}};
 const context=vm.createContext({wx,Page:definition=>{captured.page=definition;},App:definition=>{captured.app=definition;},console,setTimeout,clearTimeout,Date,Math,Promise,Map,Set,JSON,Number,Object,Array,Error});
 function load(file){file=resolve(root,file);if(file.endsWith('/config.js'))return {config};if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=readFileSync(file,'utf8');const fn=new vm.Script('(function(require,module,exports){'+code+'\n})',{filename:file}).runInContext(context);fn(name=>{assert.ok(name.startsWith('.'),'no external packages inside native client');return load(resolve(dirname(file),name+(name.endsWith('.js')?'':'.js')));},module,module.exports);return module.exports;}
 return {load,wx,storage,captured};
}
const snapshot=x=>JSON.parse(JSON.stringify(x));
test('all configured pages have native resources and bound handlers exist',()=>{
 const app=JSON.parse(readFileSync(resolve(root,'app.json'),'utf8'));for(const path of app.pages){const r=runtime();r.load(path+'.js');const page=r.captured.page;assert.ok(page,'Page registered: '+path);const wxml=readFileSync(resolve(root,path+'.wxml'),'utf8');for(const match of wxml.matchAll(/(?:bind|catch)(?:tap|input|change|submit)="([A-Za-z][\w]*)"/g))assert.equal(typeof page[match[1]],'function',path+' handler '+match[1]);assert.ok(existsSync(resolve(root,path+'.json')));}
 const config=JSON.parse(readFileSync(resolve(root,'project.config.json'),'utf8'));assert.equal(config.appid,'touristappid');assert.equal(config.setting.urlCheck,true);
});
test('shared generated scheduling core produces exactly the web schedule',()=>{const r=runtime(),core=r.load('core/planner.js');const state=emptyState();state.tasks=[{id:'t',title:'工作',minutes:120,workedMinutes:60,deadline:'2026-10-23',priority:'medium',category:'work',splittable:true,completed:false,locked:false,recurrence:'none',notes:''}];const now=at('2026-10-22','09:00');assert.deepEqual(snapshot(core.schedule(state,now)),schedule(state,now));});
test('API adapter sends bearer tokens and never uses ambient web cookies',async()=>{let received;const r=runtime({network:options=>{received=options;return {statusCode:200,data:{ok:true}};}});const api=r.load('api.js');api.session.set('test-token');await api.call('/api/state');assert.equal(received.header.Authorization,'Bearer test-token');assert.equal(received.header.Cookie,undefined);assert.equal(received.url,'https://planner.example.test/api/state');});
test('an unconfigured or insecure backend is rejected before a request is sent',async()=>{for(const apiBase of ['', 'http://example.test','https://example.test/path']){let sent=false;const r=runtime({config:{apiBase},network:()=>{sent=true;}});await assert.rejects(r.load('api.js').call('/api/state'));assert.equal(sent,false);}});
test('task editor schedules only remaining work and refuses stale editor overwrites',async()=>{
 const r=runtime();r.load('pages/task/index.js');const def=r.captured.page;const state=emptyState();state.tasks=[{id:'t',title:'写方案',minutes:120,workedMinutes:30,deadline:'2026-12-01',priority:'medium',category:'work',splittable:true,completed:false,locked:false,recurrence:'none',notes:''}];let committed;
 const store=r.load('store.js').store;store.boot=async()=>{};store.snapshot=()=>({state,access:{canUse:true}});store.commit=next=>{committed=next;};
 const page={...def,data:structuredClone(def.data),setData(patch){Object.assign(this.data,patch);}};await page.onLoad({id:'t'});page.input({currentTarget:{dataset:{field:'worked'}},detail:{value:'60'}});assert.equal(page.data.remaining,60);page.save();assert.equal(committed.tasks[0].workedMinutes,60);assert.equal(committed.tasks[0].minutes,120);
 committed=null;state.tasks[0].notes='其他设备更新';page.save();assert.equal(committed,null);assert.match(page.data.error,/已被其他操作更新/);
});
test('AI acceptance retains dependencies and requires selecting prerequisites',()=>{
 const r=runtime();r.load('pages/assistant/index.js');const def=r.captured.page;const store=r.load('store.js').store;let committed;store.snapshot=()=>({state:emptyState()});store.commit=next=>{committed=next;};
 const draft={title:'调研',minutes:30,deadline:'2026-12-01',notBefore:'',notBeforeTime:'',deadlineTime:'',priority:'medium',category:'work',splittable:true,notes:'',selected:true,dependsOn:[]};const page={...def,data:{...structuredClone(def.data),drafts:[draft,{...draft,title:'写作',dependsOn:[0]}]},setData(patch){Object.assign(this.data,patch);}};
 page.data.drafts[0].selected=false;page.accept();assert.equal(committed,undefined);page.data.drafts[0].selected=true;page.accept();assert.equal(committed.tasks.length,2);assert.deepEqual(snapshot(committed.tasks[1].dependsOn),[committed.tasks[0].id]);
});
test('session tokens are namespaced by configured backend',()=>{const r=runtime(),api=r.load('api.js');api.session.set('test-session');assert.equal(api.session.get(),'test-session');assert.ok([...r.storage.keys()][0].includes('https://planner.example.test'));api.session.clear();assert.equal(api.session.get(),'');});
