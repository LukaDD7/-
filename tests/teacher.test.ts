import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTeacherState, dailyQuote, isTeacherDate, parseWorkText, printArchiveHtml, QUOTE_COUNT,
  teacherAddDays, teacherId, teacherMonday, teacherStats, teacherToday, validateTeacherState,
  type TeacherState, type WorkItem,
} from '../lib/teacher.ts';

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
const item = (patch: Partial<WorkItem> = {}): WorkItem => ({id:'work',title:'班级工作',date:'2026-11-17',time:'09:00',priority:'medium',category:'daily',status:'pending',remind:true,remindBefore:30,notes:'',createdAt:'2026-11-17T00:00:00.000Z',...patch});

test('Shanghai dates and calendar arithmetic are independent of the host timezone', () => {
  assert.equal(teacherToday(Date.parse('2026-11-17T16:01:00Z')),'2026-11-18');
  assert.equal(teacherToday(Date.parse('2026-11-17T15:59:00Z')),'2026-11-17');
  assert.equal(teacherMonday('2026-11-22'),'2026-11-16');
  assert.equal(teacherMonday('2026-11-16'),'2026-11-16');
  assert.equal(teacherAddDays('2028-02-28',2),'2028-03-01');
  assert.equal(teacherAddDays('2026-12-31',1),'2027-01-01');
  assert.equal(teacherAddDays('2026-02-30',1),'');
  assert.equal(isTeacherDate('2026-02-29'),false);
  assert.notEqual(teacherId(),teacherId());
});

test('empty state and rich demo round-trip through strict validation', () => {
  const empty = createTeacherState();
  assert.equal(validateTeacherState(empty),true);
  assert.equal(empty.settings.teacherName,'班主任');
  assert.equal(empty.settings.className,'我的班级');
  const demo = createTeacherState(true);
  assert.equal(validateTeacherState(clone(demo)),true);
  assert.ok(demo.items.length >= 8);
  assert.ok(demo.students.length && demo.incidents.length && demo.meetings.length);
  assert.ok(demo.items.every(entry => entry.id.startsWith('demo-')));
  assert.equal(demo.items.find(entry=>entry.id==='demo-material')?.date,teacherToday());
});

test('strict restore validation rejects invalid dates, enums, duplicate IDs and dangling references', () => {
  const state = createTeacherState(); state.items = [item()];
  assert.equal(validateTeacherState(state),true);
  for (const patch of [
    {date:'2026-02-30'}, {time:'24:00'}, {date:'',time:'09:00'}, {priority:'urgent'},
    {remindBefore:-1}, {remindBefore:1.5}, {studentId:'missing'},
    {createdAt:'2026-11-17T24:00:00Z'}, {extra:'unrecognized'}, {title:''}, {endDate:'2026-11-16'},
  ]) assert.equal(validateTeacherState({...state,items:[{...item(),...patch}]}),false,JSON.stringify(patch));
  assert.equal(validateTeacherState({...state,items:[item(),item()]}),false);
  assert.equal(validateTeacherState({...state,version:2}),false);
  assert.equal(validateTeacherState({...state,unknown:[]}),false);
  assert.equal(validateTeacherState({...state,quoteHistory:{'2026-11-17':QUOTE_COUNT}}),false);
  assert.equal(validateTeacherState({...state,settings:{...state.settings,meetingReminderDay:8}}),false);
  assert.equal(validateTeacherState({...state,settings:{...state.settings,meetingReminderDay:0}}),false);
  assert.equal(validateTeacherState({...state,settings:{...state.settings,meetingReminderDay:7}}),true);
});

test('interview clock time is optional for old backups and validated when present', () => {
  const state = createTeacherState();
  state.students = [{id:'student',code:'S001',situation:'',interviews:[{id:'interview',date:'2026-11-17',content:'访谈',action:''}],followUpDate:'',createdAt:'2026-11-17T00:00:00Z'}];
  assert.equal(validateTeacherState(state),true);
  const interview = state.students[0].interviews[0];
  interview.time = '16:20';
  assert.equal(validateTeacherState(state),true);
  assert.equal(teacherStats(state,'2026-11-17','2026-11-17').interviews,1);
  interview.time = '24:00';
  assert.equal(validateTeacherState(state),false);
  interview.time = '16:20'; interview.date = '2026-11-17T16:20';
  assert.equal(validateTeacherState(state),false);
});

test('text drafts recognize line numbers, explicit dates, weekdays, relative days and Chinese clocks', () => {
  const drafts = parseWorkText('1. 明天上午9:30提交班级材料\n二、周五下午三点半召开班会\n③ 11月18日 08:00期中考试\n- 下周一 14:00家长沟通\n11.20 10:30运动会','2026-11-17');
  assert.equal(drafts.length,5);
  assert.deepEqual(drafts.map(d=>d.date),['2026-11-18','2026-11-20','2026-11-18','2026-11-23','2026-11-20']);
  assert.deepEqual(drafts.map(d=>d.time),['09:30','15:30','08:00','14:00','10:30']);
  assert.deepEqual(drafts.map(d=>d.category),['material','meeting','exam','care','activity']);
  assert.ok(drafts.every(d=>!d.needsReview));
  assert.equal(drafts[0].title,'提交班级材料');
});

test('date headers carry only their explicit date; unknown and malformed dates require review', () => {
  const drafts = parseWorkText('周三：\n1、上午9点提交名单\n2、下午2点班会\n周四：\n整理教室','2026-11-17');
  assert.equal(drafts.length,3);
  assert.deepEqual(drafts.map(d=>d.date),['2026-11-18','2026-11-18','2026-11-19']);
  assert.equal(parseWorkText('整理教室','2026-11-17')[0].date,'');
  assert.equal(parseWorkText('整理教室','2026-11-17')[0].needsReview,true);
  assert.equal(parseWorkText('明天提交名单\n整理教室','2026-11-17')[1].date,'');
  const invalid = parseWorkText('2月30日 25:00提交材料','2026-11-17')[0];
  assert.equal(invalid.date,''); assert.equal(invalid.time,''); assert.equal(invalid.needsReview,true);
  const oldYear = parseWorkText('2027.1.4 10:00考试','2026-11-17')[0];
  assert.equal(oldYear.date,'2027-01-04');
  assert.equal(parseWorkText('周日 3点开会','2026-11-17')[0].needsReview,true);
});

test('reports count completion and closure by Shanghai timestamp, meetings and interviews by their dates', () => {
  const state = createTeacherState();
  state.items = [item({id:'done',date:'2026-11-10',status:'done',completedAt:'2026-11-16T16:01:00Z'}),item({id:'outside',status:'done',completedAt:'2026-11-17T16:00:00Z'}),item({id:'pending'}),item({id:'cancelled',status:'cancelled'})];
  state.incidents = [{id:'incident',date:'2026-11-16',time:'09:00',title:'事件',description:'情况',method:'处理',result:'结果',status:'closed',folderId:'general',followUpDate:'',createdAt:'2026-11-16T00:00:00Z',closedAt:'2026-11-17T00:00:00Z'}];
  state.meetings = [{id:'meeting',date:'2026-11-17',time:'15:30',topic:'班会',content:'',status:'held',followUp:'',createdAt:'2026-11-17T00:00:00Z'}];
  state.students = [{id:'student',code:'S001',situation:'',interviews:[{id:'interview',date:'2026-11-17',content:'访谈',action:''}],followUpDate:'',createdAt:'2026-11-17T00:00:00Z'}];
  assert.deepEqual(teacherStats(state,'2026-11-17','2026-11-17'),{completed:1,incidentNew:0,incidentClosed:1,meetings:1,interviews:1,pending:1});
  assert.deepEqual(teacherStats(state,'2026-11-18','2026-11-17'),{completed:0,incidentNew:0,incidentClosed:0,meetings:0,interviews:0,pending:0});
});

test('daily caring messages stay stable and do not repeat until the reviewed pool is used', () => {
  const state: TeacherState = createTeacherState(); const indexes = new Set<number>();
  assert.ok(QUOTE_COUNT >= 50);
  for (let day = 0; day < QUOTE_COUNT; day++) {
    const date = teacherAddDays('2026-01-01',day); const quote = dailyQuote(state,date);
    assert.ok(!indexes.has(quote.index)); indexes.add(quote.index);
    state.quoteHistory[date] = quote.index;
    assert.deepEqual(dailyQuote(state,date),quote);
  }
  const next = dailyQuote(state,teacherAddDays('2026-01-01',QUOTE_COUNT));
  assert.ok(next.text && next.kind);
  assert.notEqual(next.index,state.quoteHistory[teacherAddDays('2026-01-01',QUOTE_COUNT-1)]);
});

test('print archive escapes every supplied cell and title before producing printable markup', () => {
  const html = printArchiveHtml('<script>alert(1)</script>',['事件','<img src=x onerror=alert(1)>'],[['A & B','<svg onload=alert(1)>\n新行']]);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<svg'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(html.includes('@media print'));
});
