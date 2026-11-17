import test from 'node:test';
import assert from 'node:assert/strict';
import {at,dateKey,emptyState,moveBlock,schedule,validateState,type Task} from '../lib/planner.ts';
const now=at('2026-10-13','09:00');
function task(p:Partial<Task>={}):Task{return{id:'a',title:'写需求',minutes:60,deadline:'2026-10-13',priority:'medium',category:'work',splittable:true,completed:false,locked:false,recurrence:'none',notes:'',...p};}
test('fixed events, lunch and task breaks are respected',()=>{
 const s=emptyState();s.tasks=[task(),task({id:'b',minutes:180}),task({id:'c',minutes:120})];s.events=[{id:'meet',title:'会议',start:at('2026-10-13','10:00'),end:at('2026-10-13','11:00')}];
 const r=schedule(s,now);assert.equal(r.warnings.length,0);
 for(const b of r.blocks){assert.ok(b.start>=now);assert.ok(!(b.start<at('2026-10-13','13:00')&&b.end>at('2026-10-13','12:00')));assert.ok(!(b.start<s.events[0].end&&b.end>s.events[0].start));}
 const sorted=[...r.blocks].sort((a,b)=>a.start-b.start);for(let i=1;i<sorted.length;i++)assert.ok(sorted[i].start>=sorted[i-1].end+600000);
 for(const t of s.tasks)assert.equal(r.blocks.filter(b=>b.taskId===t.id).reduce((a,b)=>a+(b.end-b.start)/60000,0),t.minutes);
});
test('infeasible tasks roll back partial allocations',()=>{const s=emptyState();s.tasks=[task({minutes:600,priority:'high'}),task({id:'b',minutes:60})];const r=schedule(s,now);assert.equal(r.warnings.length,1);assert.ok(r.blocks.every(b=>b.taskId==='b'));assert.equal(r.blocks[0].start,now);});
test('non-splittable task never crosses lunch',()=>{const s=emptyState();s.tasks=[task({minutes:240,splittable:false})];const r=schedule(s,now);assert.equal(r.blocks.length,1);assert.equal(r.blocks[0].start,at('2026-10-13','13:00'));});
test('locked blocks stay in place across replanning',()=>{const s=emptyState();s.tasks=[task({locked:true}),task({id:'b'})];s.blocks=[{id:'fixed',taskId:'a',start:at('2026-10-13','14:00'),end:at('2026-10-13','15:00')}];const r=schedule(s,now);assert.deepEqual(r.blocks.find(b=>b.id==='fixed'),s.blocks[0]);});
test('weekends skipped, but can be enabled',()=>{const s=emptyState();s.tasks=[task({deadline:'2026-10-18'})];const sat=at('2026-10-17','09:00');assert.equal(schedule(s,sat).blocks.length,0);s.settings.weekends=true;assert.equal(dateKey(schedule(s,sat).blocks[0].start),'2026-10-17');});
test('earliest start and past deadlines constrain the plan',()=>{const s=emptyState();s.tasks=[task({notBefore:'2026-10-14',deadline:'2026-10-14'}),task({id:'b',deadline:'2026-10-12'})];const r=schedule(s,now);assert.equal(dateKey(r.blocks[0].start),'2026-10-14');assert.equal(r.warnings[0].taskId,'b');});
test('completed tasks consume no time',()=>{const s=emptyState();s.tasks=[task({completed:true}),task({id:'b'})];const r=schedule(s,now);assert.equal(r.blocks.length,1);assert.equal(r.blocks[0].taskId,'b');});
test('moving rejects meetings, past time, lunch and deadlines',()=>{const s=emptyState();s.tasks=[task()];s.blocks=[{id:'a-0',taskId:'a',start:now,end:now+3600000}];s.events=[{id:'e',title:'会议',start:at('2026-10-13','14:00'),end:at('2026-10-13','15:00')}];for(const start of [now-60000,at('2026-10-13','12:00'),at('2026-10-13','14:00'),at('2026-10-14','09:00')])assert.ok(moveBlock(s,'a-0',start,now).error);const moved=moveBlock(s,'a-0',at('2026-10-13','15:30'),now);assert.ok(moved.state);assert.equal(moved.state.tasks[0].locked,true);});
test('high priority wins equal deadlines, independent of input order',()=>{const s=emptyState();s.tasks=[task({id:'low',priority:'low'}),task({id:'high',priority:'high'})];const r=schedule(s,now);assert.equal(r.blocks[0].taskId,'high');assert.deepEqual(schedule({...s,tasks:[...s.tasks].reverse()},now),r);});
test('backup validation rejects duplicates, orphan blocks and invalid dates',()=>{const s=emptyState();s.tasks=[task()];assert.equal(validateState(s),true);assert.equal(validateState({...s,tasks:[task(),task()]}),false);assert.equal(validateState({...s,tasks:[task({deadline:'2026-02-30'})]}),false);assert.equal(validateState({...s,blocks:[{id:'bad',taskId:'missing',start:now,end:now+60000}]}),false);assert.equal(validateState({...s,settings:{...s.settings,workStart:'invalid'}}),false);});
test('dependencies override priority and respect the full predecessor duration',()=>{const s=emptyState();s.tasks=[task({id:'research',minutes:120,priority:'low'}),task({id:'write',priority:'high',dependsOn:['research']})];const r=schedule(s,now);assert.equal(r.warnings.length,0);const parentEnd=Math.max(...r.blocks.filter(b=>b.taskId==='research').map(b=>b.end));assert.ok(r.blocks.filter(b=>b.taskId==='write').every(b=>b.start>=parentEnd+600000));});
test('failed prerequisites block descendants; cycles are reported',()=>{const s=emptyState();s.tasks=[task({id:'research',minutes:1000}),task({id:'write',dependsOn:['research']})];const r=schedule(s,now);assert.equal(r.blocks.length,0);assert.equal(r.warnings.length,2);s.tasks=[task({id:'a',dependsOn:['b']}),task({id:'b',dependsOn:['a']})];assert.equal(schedule(s,now).warnings.length,2);});

test('a tomorrow-afternoon start is respected even when today is empty',()=>{
 const s=emptyState();s.tasks=[task({notBefore:'2026-10-14',notBeforeTime:'14:00',deadline:'2026-10-14',deadlineTime:'15:00',splittable:false})];
 const r=schedule(s,now);assert.equal(r.warnings.length,0);assert.equal(r.blocks[0].start,at('2026-10-14','14:00'));assert.equal(r.blocks[0].end,at('2026-10-14','15:00'));
});
test('explicit completion time prevents work from spilling past a fixed window',()=>{
 const s=emptyState();s.tasks=[task({notBefore:'2026-10-14',notBeforeTime:'14:00',deadline:'2026-10-14',deadlineTime:'14:30'})];
 const r=schedule(s,now);assert.equal(r.blocks.length,0);assert.equal(r.warnings[0].availableMinutes,30);assert.match(r.warnings[0].message,/60.*30/);assert.ok(r.warnings[0].suggestions?.length);
});
test('continuous work explains fragmentation rather than claiming total capacity is insufficient',()=>{
 const s=emptyState();s.tasks=[task({minutes:360,splittable:false})];const r=schedule(s,now);assert.equal(r.blocks.length,0);assert.match(r.warnings[0].message,/连续 360.*最长.*300/);assert.equal(r.warnings[0].availableMinutes,480);
});
test('time constraints validate backups and also apply to drag-and-drop',()=>{
 const s=emptyState();s.tasks=[task({notBefore:'2026-10-14',notBeforeTime:'14:00',deadline:'2026-10-14',deadlineTime:'16:00'})];s.blocks=schedule(s,now).blocks;
 assert.equal(validateState(s),true);assert.ok(moveBlock(s,s.blocks[0].id,at('2026-10-14','13:30'),now).error);assert.ok(moveBlock(s,s.blocks[0].id,at('2026-10-14','15:30'),now).error);
 for(const patch of [{notBeforeTime:'25:00'},{notBeforeTime:14},{notBefore:'',notBeforeTime:'14:00'},{deadline:'',deadlineTime:'16:00'}])assert.equal(validateState({...s,tasks:[{...s.tasks[0],...patch}]}),false);
});
test('reversed, expired and distant windows have different explanations',()=>{
 const s=emptyState();s.tasks=[task({notBefore:'2026-10-14',notBeforeTime:'16:00',deadline:'2026-10-14',deadlineTime:'15:00'})];assert.match(schedule(s,now).warnings[0].message,/最早开始时间晚于截止/);
 s.tasks=[task({deadlineTime:'08:30'})];assert.match(schedule(s,now).warnings[0].message,/截止时间已过/);
 s.tasks=[task({notBefore:'2026-12-01',deadline:'2026-12-02'})];assert.match(schedule(s,now).warnings[0].message,/21 天排程范围/);
});
test('locked work warns when updated constraints exclude its existing time',()=>{
 const s=emptyState();s.tasks=[task({locked:true,notBefore:'2026-10-14',notBeforeTime:'14:00',deadline:'2026-10-14',deadlineTime:'16:00'})];s.blocks=[{id:'locked',taskId:'a',start:at('2026-10-14','13:00'),end:at('2026-10-14','14:00')}];
 const result=schedule(s,now);assert.deepEqual(result.blocks,s.blocks);assert.match(result.warnings[0].message,/早于最早开始时间/);
});

test('remaining work schedules only unfinished minutes and old tasks stay compatible',async()=>{
 const {remainingMinutes}=await import('../lib/planner.ts');const s=emptyState();
 s.tasks=[task({minutes:120,workedMinutes:60})];const r=schedule(s,now);
 assert.equal(remainingMinutes(s.tasks[0]),60);assert.equal(r.blocks.reduce((sum,b)=>sum+(b.end-b.start)/60000,0),60);assert.equal(s.tasks[0].minutes,120);
 assert.equal(remainingMinutes(task()),60);assert.equal(remainingMinutes(task({completed:true,workedMinutes:15})),0);
});
test('progress snapshots reject invalid or exhausted unfinished effort',()=>{
 const s=emptyState();for(const workedMinutes of [-5,2,65,NaN,'5'])assert.equal(validateState({...s,tasks:[task({workedMinutes:workedMinutes as number})]}),false);
 assert.equal(validateState({...s,tasks:[task({workedMinutes:30})]}),true);assert.equal(validateState({...s,tasks:[task({completed:true,workedMinutes:60})]}),true);
});
test('daily review joins overdue, missed and infeasible tasks without mutating deadlines',async()=>{
 const {dailyReview}=await import('../lib/planner.ts');const s=emptyState();s.tasks=[task({id:'overdue',deadline:'2026-10-12'}),task({id:'missed',deadline:'2026-10-16'}),task({id:'today'}),task({id:'future',deadline:'2026-10-16'}),task({id:'finished',completed:true,deadline:'2026-10-12'})];
 s.blocks=[{id:'missed-old',taskId:'missed',start:now-7200000,end:now-3600000}];const before=JSON.stringify(s);const review=dailyReview(s,now);
 assert.deepEqual(review.map(item=>item.task.id),['overdue','missed','today']);assert.equal(review[0].overdue,true);assert.equal(review[1].missed,true);assert.equal(JSON.stringify(s),before);
 const late=dailyReview(s,at('2026-10-14','09:00'));assert.equal(late.find(item=>item.task.id==='today')?.overdue,true);
});
test('review treats an exact-time deadline as overdue and respects completed exclusions',async()=>{
 const {dailyReview}=await import('../lib/planner.ts');const s=emptyState();s.tasks=[task({deadlineTime:'08:30'}),task({id:'b',completed:true})];assert.equal(dailyReview(s,now)[0].overdue,true);
});
test('recurring tasks reset progress and schedule their next occurrence in the future',async()=>{
 const {toggleTaskComplete}=await import('../lib/planner.ts');const s=emptyState();s.tasks=[task({deadline:'2026-10-10',recurrence:'daily',minutes:120,workedMinutes:60})];const next=toggleTaskComplete(s,'a',now);
 assert.equal(next.tasks[0].completed,true);assert.equal(next.tasks[0].workedMinutes,60);assert.equal(next.tasks[1].deadline,'2026-10-14');assert.equal(next.tasks[1].workedMinutes,0);
 const reopened=toggleTaskComplete(next,'a',now);assert.equal(reopened.tasks.length,2);assert.equal(reopened.tasks[0].completed,false);assert.equal(validateState(reopened),true);
});

test('restoring fully logged work preserves invested time and asks for a new remaining estimate',async()=>{
 const {toggleTaskComplete,dailyReview}=await import('../lib/planner.ts');const s=emptyState();s.tasks=[task({completed:true,workedMinutes:60})];const restored=toggleTaskComplete(s,'a',now);assert.equal(restored.tasks[0].workedMinutes,60);assert.equal(restored.tasks[0].minutes,60);assert.equal(validateState(restored),true);assert.equal(schedule(restored,now).blocks.length,0);assert.match(dailyReview(restored,now)[0].warning!.message,/已投入达到/);
});
