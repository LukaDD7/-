import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeacherState, teacherStats, validateTeacherState, type WorkItem} from '../lib/teacher.ts';
import {clearTeacherDemo, linkTeacherWork, toggleTeacherWork} from '../lib/teacher-workflows.ts';

const createdAt = '2026-11-10T00:00:00.000Z';
const completedAt = '2026-11-16T08:00:00.000Z';
const work = (patch: Partial<WorkItem> = {}): WorkItem => ({id:'work-a',title:'学生跟进',date:'2026-11-16',time:'16:30',priority:'medium',category:'care',status:'pending',remind:false,remindBefore:60,notes:'旧描述',createdAt,source:'care:student-a',...patch});

test('editing the same follow-up preserves its completion, identity and teacher reminder choices', () => {
  for (const source of ['care:student-a','incident:incident-a']) {
    const state = createTeacherState();
    const previous = work({source,status:'done',completedAt}); state.items = [previous];
    const before = JSON.stringify(state);
    const result = linkTeacherWork(state,source,{...previous,title:'新的描述',notes:'补充信息',status:'pending',remind:true,remindBefore:30,completedAt:undefined});
    assert.equal(result.items.length,1);
    assert.deepEqual(result.items[0],{...previous,title:'新的描述',notes:'补充信息'});
    assert.equal(JSON.stringify(state),before);
  }
});

test('rescheduling a completed follow-up keeps the old work in its original reporting period', () => {
  const state = createTeacherState(); const previous = work({status:'done',completedAt}); state.items = [previous];
  const result = linkTeacherWork(state,'care:student-a',{...previous,date:'2026-11-20',status:'pending'});
  const history = result.items.find(item=>item.source===`history:care:student-a:${previous.id}`)!;
  const next = result.items.find(item=>item.source==='care:student-a')!;
  assert.equal(history.id,previous.id); assert.equal(history.completedAt,completedAt);
  assert.notEqual(next.id,previous.id); assert.equal(next.status,'pending'); assert.equal(next.completedAt,undefined);
  assert.equal(teacherStats(result,'2026-11-16','2026-11-16').completed,1);
  assert.equal(teacherStats(result,'2026-11-20','2026-11-20').completed,0);
  assert.equal(validateTeacherState(result),true);
});

test('a second follow-up at another time keeps history; an unfinished appointment reuses its ID', () => {
  const state = createTeacherState(); const previous = work({status:'done',completedAt}); state.items = [previous];
  const done = linkTeacherWork(state,'care:student-a',{...previous,time:'17:30',status:'pending'});
  assert.equal(done.items.length,2);
  const pending = work({status:'progress'}); state.items = [pending];
  const moved = linkTeacherWork(state,'care:student-a',{...pending,date:'2026-11-20',status:'pending'});
  assert.equal(moved.items.length,1); assert.equal(moved.items[0].id,pending.id); assert.equal(moved.items[0].createdAt,createdAt);
});

test('removing a follow-up retains completed history while removing unfinished or meeting links', () => {
  for (const source of ['care:student-a','incident:incident-a']) {
    const state = createTeacherState(); state.items = [work({source,status:'done',completedAt})];
    const completed = linkTeacherWork(state,source,null);
    assert.equal(completed.items.length,1); assert.equal(completed.items[0].source,`history:${source}:work-a`);
    state.items[0].status = 'pending';
    assert.equal(linkTeacherWork(state,source,null).items.length,0);
  }
  const state = createTeacherState(); state.items = [work({source:'meeting:meeting-a',status:'done',completedAt})];
  assert.equal(linkTeacherWork(state,'meeting:meeting-a',null).items.length,0);
});

test('held meeting edits preserve completion time; changing back to planned clears it', () => {
  const state = createTeacherState(); const previous = work({source:'meeting:meeting-a',category:'meeting',status:'done',completedAt}); state.items = [previous];
  const edited = linkTeacherWork(state,'meeting:meeting-a',{...previous,title:'更新班会内容',date:'2026-11-17',completedAt:'2026-11-17T08:00:00Z',remind:true,remindBefore:30});
  assert.equal(edited.items[0].date,'2026-11-17'); assert.equal(edited.items[0].completedAt,completedAt);
  assert.equal(edited.items[0].remind,false); assert.equal(edited.items[0].remindBefore,60);
  const planned = linkTeacherWork(edited,'meeting:meeting-a',{...edited.items[0],status:'pending'});
  assert.equal(planned.items[0].completedAt,undefined); assert.equal(planned.items[0].status,'pending');
});

test('clearing examples removes linked ghosts and clears fictional student references in personal records', () => {
  const state = createTeacherState(true);
  state.items.push(work({id:'personal-work',studentId:'demo-student-a',source:'文字导入'}),work({id:'ghost-meeting',source:'meeting:demo-meeting-b'}),work({id:'ghost-care-history',source:'history:care:demo-student-a:old'}));
  state.students.push({id:'student-real',code:'R001',situation:'个人记录',interviews:[],followUpDate:'',createdAt});
  state.incidents.push({id:'incident-real',date:'2026-11-16',time:'09:00',title:'个人事件',description:'情况',method:'方法',result:'',status:'open',folderId:'general',studentId:'demo-student-a',followUpDate:'',createdAt});
  state.meetings.push({id:'meeting-real',date:'2026-11-16',time:'16:00',topic:'个人班会',content:'',status:'planned',followUp:'',createdAt});
  const before = JSON.stringify(state); const cleared = clearTeacherDemo(state);
  assert.deepEqual(cleared.items.map(item=>item.id),['personal-work']);
  assert.equal(cleared.items[0].studentId,undefined); assert.equal(cleared.incidents[0].studentId,undefined);
  assert.equal(cleared.students[0].id,'student-real'); assert.equal(cleared.meetings[0].id,'meeting-real');
  assert.equal(cleared.folders,state.folders); assert.equal(cleared.settings,state.settings); assert.equal(cleared.quoteHistory,state.quoteHistory);
  assert.equal(validateTeacherState(cleared),true); assert.equal(JSON.stringify(state),before);
});

test('toggling a linked meeting updates both views without mutating original records', () => {
  const state = createTeacherState(); state.items = [work({source:'meeting:meeting-a',category:'meeting'})];
  state.meetings = [{id:'meeting-a',date:'2026-11-16',time:'16:30',topic:'班会',content:'',status:'planned',followUp:'',createdAt}];
  const completed = toggleTeacherWork(state,'work-a',completedAt);
  assert.equal(completed.items[0].status,'done'); assert.equal(completed.items[0].completedAt,completedAt); assert.equal(completed.meetings[0].status,'held');
  assert.equal(state.items[0].status,'pending'); assert.equal(state.meetings[0].status,'planned');
  const restored = toggleTeacherWork(completed,'work-a');
  assert.equal(restored.items[0].status,'pending'); assert.equal(restored.items[0].completedAt,undefined); assert.equal(restored.meetings[0].status,'planned');
  assert.equal(toggleTeacherWork(state,'unknown'),state);
});
