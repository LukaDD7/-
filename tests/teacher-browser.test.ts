import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeacherState, type WorkItem, type Student, type Meeting, type Incident } from '../lib/teacher.ts';
import { buildTeacherReminders } from '../lib/teacher-browser.ts';

const clock = Date.parse('2026-11-16T16:30:00Z'); // Tuesday 00:30 in Shanghai.
function empty() {
  const state = createTeacherState(false);
  state.items = []; state.students = []; state.incidents = []; state.meetings = [];
  state.settings.meetingReminderDay = 1;
  state.settings.meetingReminderTime = '17:00';
  return state;
}
function item(overrides: Partial<WorkItem> = {}): WorkItem {
  return { id: 'test-work', title: '期中考试', date: '2026-11-18', time: '08:00', priority: 'high', category: 'exam', status: 'pending', remind: true, remindBefore: 1440, notes: '', createdAt: '2026-11-16T00:00:00Z', ...overrides };
}

test('reminder time is absolute Shanghai time and supports the previous day', () => {
  const state = empty(); state.items.push(item());
  const reminder = buildTeacherReminders(state, clock).find(value => value.sourceId === 'test-work');
  assert.equal(reminder?.at, '2026-11-17T00:00:00.000Z');
  assert.equal(reminder?.title, '期中考试');
});

test('completed, cancelled, or disabled work never remains in the reminder queue', () => {
  const state = empty();
  state.items.push(item({ id: 'done', status: 'done' }), item({ id: 'cancelled', status: 'cancelled' }), item({ id: 'disabled', remind: false }));
  assert.equal(buildTeacherReminders(state, clock).filter(value => value.kind === 'work').length, 0);
});

test('rescheduling updates reminder time without leaving an old scheduled occurrence', () => {
  const state = empty(); state.items.push(item());
  const original = buildTeacherReminders(state, clock).find(value => value.kind === 'work')!;
  state.items[0].date = '2026-11-20';
  const revised = buildTeacherReminders(state, clock).filter(value => value.kind === 'work');
  assert.equal(revised.length, 1);
  assert.equal(revised[0].id, original.id);
  assert.equal(revised[0].at, '2026-11-19T00:00:00.000Z');
});

test('care follow-ups and open incident rechecks enter the unified queue', () => {
  const state = empty();
  const student: Student = { id: 'student-a', code: 'A01', situation: '需跟进', createdAt: '2026-11-01T00:00:00Z', followUpDate: '2026-11-18', interviews: [] };
  const incident: Incident = { id: 'event-a', date: '2026-11-15', time: '11:00', title: '课间争执', description: '了解情况', method: '分别谈话', result: '待复查', status: 'followup', folderId: '', followUpDate: '2026-11-19', createdAt: '2026-11-15T00:00:00Z' };
  state.students.push(student); state.incidents.push(incident);
  const reminders = buildTeacherReminders(state, clock);
  assert.equal(reminders.find(value => value.sourceId === student.id)?.at, '2026-11-18T01:00:00.000Z');
  assert.equal(reminders.find(value => value.sourceId === incident.id)?.at, '2026-11-19T01:00:00.000Z');
  incident.status = 'closed';
  assert.equal(buildTeacherReminders(state, clock).some(value => value.sourceId === incident.id), false);
});

test('this week’s recorded topic cancels only the current weekly record reminder', () => {
  const state = empty();
  assert.equal(buildTeacherReminders(state, clock).find(value => value.kind === 'meeting-record')?.sourceId, '2026-11-16');
  const past: Meeting = { id: 'past', date: '2026-11-09', time: '16:00', topic: '上周主题', content: '', status: 'held', followUp: '', createdAt: '2026-11-09T00:00:00Z' };
  state.meetings.push(past);
  assert.equal(buildTeacherReminders(state, clock).filter(value => value.kind === 'meeting-record').length, 1);
  state.meetings.push({ ...past, id: 'current', date: '2026-11-16', topic: '本周主题' });
  assert.equal(buildTeacherReminders(state, clock).filter(value => value.kind === 'meeting-record').length, 0);
});

test('a linked care task represents one follow-up; an unrelated exam does not hide it', () => {
  const state = empty();
  state.students.push({ id: 'student-a', code: 'A01', situation: '', createdAt: '2026-11-01T00:00:00Z', followUpDate: '2026-11-18', interviews: [] });
  state.items.push(item({ studentId: 'student-a', category: 'care' }));
  assert.equal(buildTeacherReminders(state, clock).some(value => value.kind === 'care'), false);
  state.items[0].category = 'exam';
  assert.equal(buildTeacherReminders(state, clock).some(value => value.kind === 'care'), true);
});

test('turning off or completing a linked follow-up never resurrects its fallback', () => {
  const state = empty();
  state.students.push({ id: 'student-a', code: 'A01', situation: '', createdAt: '2026-11-01T00:00:00Z', followUpDate: '2026-11-18', interviews: [] });
  state.incidents.push({ id: 'event-a', date: '2026-11-15', time: '11:00', title: '课间争执', description: '', method: '', result: '', status: 'followup', folderId: '', followUpDate: '2026-11-19', createdAt: '2026-11-15T00:00:00Z' });
  state.items.push(item({ id: 'care-work', category: 'care', source: 'care:student-a', studentId: 'student-a', remind: false }), item({ id: 'event-work', category: 'incident', source: 'incident:event-a', remind: false }));
  for (const scenario of [{status:'pending',remind:false}, {status:'done',remind:true}, {status:'cancelled',remind:true}] as const) {
    state.items.forEach(value => { value.status = scenario.status; value.remind = scenario.remind; });
    const reminders = buildTeacherReminders(state, clock);
    assert.equal(reminders.some(value => ['care', 'incident', 'work'].includes(value.kind)), false, `status: ${scenario.status}`);
  }
});

test('cross-midnight quiet hours defer both evening and early-morning reminders to the next allowed minute', () => {
  const state = empty(); state.settings.quietStart = '22:00'; state.settings.quietEnd = '07:00';
  state.items.push(item({ id: 'evening', date: '2026-11-18', time: '22:30', remindBefore: 0 }), item({ id: 'morning', date: '2026-11-19', time: '06:30', remindBefore: 0 }), item({ id: 'boundary', date: '2026-11-19', time: '07:00', remindBefore: 0 }));
  const work = buildTeacherReminders(state, clock).filter(value => value.kind === 'work');
  assert.equal(work.length, 3);
  assert.ok(work.every(value => value.at === '2026-11-18T23:00:00.000Z'));
});

test('daytime quiet hours end on the same date; equal boundaries disable quiet hours', () => {
  const state = empty(); state.settings.quietStart = '12:00'; state.settings.quietEnd = '14:00';
  state.items.push(item({ date: '2026-11-18', time: '12:30', remindBefore: 0 }));
  assert.equal(buildTeacherReminders(state, clock).find(value => value.kind === 'work')?.at, '2026-11-18T06:00:00.000Z');
  state.settings.quietEnd = '12:00';
  assert.equal(buildTeacherReminders(state, clock).find(value => value.kind === 'work')?.at, '2026-11-18T04:30:00.000Z');
});

test('weekly reminder weekday follows Monday=1 and Sunday=7 consistently', () => {
  const state = empty(); state.settings.meetingReminderDay = 7;
  assert.equal(buildTeacherReminders(state, clock).find(value => value.kind === 'meeting-record')?.at, '2026-11-22T09:00:00.000Z');
});
