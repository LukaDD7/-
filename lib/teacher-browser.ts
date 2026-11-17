import { teacherToday, teacherMonday, teacherAddDays, validateTeacherState, type TeacherState } from './teacher.ts';

export type TeacherReminder = {
  id: string;
  title: string;
  /** An absolute ISO timestamp. Dates entered by teachers use Asia/Shanghai. */
  at: string;
  kind: 'work' | 'care' | 'incident' | 'meeting-record';
  sourceId: string;
};

function timestamp(date: string, time = '08:00', before = 0): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const value = Date.parse(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(value)) return null;
  if (new Date(value + 8 * 60 * 60_000).toISOString().slice(0, 10) !== date) return null;
  return new Date(value - Math.max(0, Number.isFinite(before) ? before : 0) * 60_000).toISOString();
}

/** Move a reminder to the first allowed minute in the teacher's local time. */
function afterQuietHours(at: string, settings: TeacherState['settings']): string {
  const asMinutes = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
  const start = asMinutes(settings.quietStart), end = asMinutes(settings.quietEnd);
  if (start === null || end === null || start === end) return at;
  const local = new Date(Date.parse(at) + 8 * 60 * 60_000).toISOString();
  const current = asMinutes(local.slice(11, 16))!;
  const date = local.slice(0, 10);
  if (start < end) {
    if (current >= start && current < end) return timestamp(date, settings.quietEnd)!;
  } else {
    if (current >= start) return timestamp(teacherAddDays(date, 1), settings.quietEnd)!;
    if (current < end) return timestamp(date, settings.quietEnd)!;
  }
  return at;
}

/** Reminder intentions only: this function never claims to send a WeChat message. */
export function buildTeacherReminders(state: TeacherState, now = Date.now()): TeacherReminder[] {
  const result: TeacherReminder[] = [];
  for (const item of state.items) {
    if (!item.remind || item.status === 'done' || item.status === 'cancelled') continue;
    const at = timestamp(item.date, item.time || '08:00', item.remindBefore);
    if (at) result.push({ id: `work:${item.id}`, title: item.title, at, kind: 'work', sourceId: item.id });
  }
  for (const student of state.students) {
    // Linked tasks own the reminder switch and completion state. Do not recreate
    // a fallback after the teacher turns that task off or completes it.
    const linked = state.items.some(item => item.source === `care:${student.id}` || (item.category === 'care' && item.studentId === student.id && item.date === student.followUpDate));
    const at = timestamp(student.followUpDate, '09:00');
    if (at && !linked) result.push({ id: `care:${student.id}`, title: `${student.code} · 关爱跟进`, at, kind: 'care', sourceId: student.id });
  }
  for (const incident of state.incidents) {
    if (incident.status === 'closed') continue;
    if (state.items.some(item => item.source === `incident:${incident.id}`)) continue;
    const at = timestamp(incident.followUpDate, '09:00');
    if (at) result.push({ id: `incident:${incident.id}`, title: `事件复查 · ${incident.title}`, at, kind: 'incident', sourceId: incident.id });
  }
  const monday = teacherMonday(teacherToday(now));
  const sunday = teacherAddDays(monday, 6);
  const recorded = state.meetings.some(meeting => meeting.date >= monday && meeting.date <= sunday && meeting.topic.trim());
  if (!recorded) {
    const weekday = state.settings.meetingReminderDay;
    const offset = weekday === 0 ? 6 : Math.max(0, Math.min(6, weekday - 1));
    const at = timestamp(teacherAddDays(monday, offset), state.settings.meetingReminderTime || '17:00');
    if (at) result.push({ id: `meeting-record:${monday}`, title: '记录本周班会主题', at, kind: 'meeting-record', sourceId: monday });
  }
  return result.map(reminder => ({ ...reminder, at: afterQuietHours(reminder.at, state.settings) }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export async function readScheduleImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MB，请压缩后重试。');
  const dataURL = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 65_000);
  try {
    const response = await fetch('/api/teacher/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataURL }), signal: abort.signal });
    let payload: { text?: string; error?: string };
    try { payload = await response.json(); } catch { throw new Error('当前环境未配置图片识别，请先粘贴周程文字。'); }
    if (!response.ok) throw new Error(payload.error || '图片识别失败，请重新上传或粘贴文字。');
    if (!payload.text?.trim()) throw new Error('没有识别到清晰文字，请上传更清晰的图片或粘贴文字。');
    return payload.text.trim();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('图片识别超时，请缩小图片后重试。');
    if (error instanceof TypeError) throw new Error('无法连接图片识别服务，请先粘贴周程文字。');
    throw error;
  } finally { clearTimeout(timer); }
}

export function downloadTeacherBackup(state: TeacherState): void {
  if (!validateTeacherState(state)) throw new Error('当前记录格式不正确，暂时无法导出。');
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `班主任工作台备份-${teacherToday()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readTeacherBackup(file: File): Promise<TeacherState> {
  if (file.size > 25 * 1024 * 1024) throw new Error('备份文件不能超过 25 MB。');
  let data: unknown;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('这不是有效的 JSON 备份文件。'); }
  if (!validateTeacherState(data)) throw new Error('备份内容不完整或版本不兼容，现有记录未被修改。');
  return data;
}
