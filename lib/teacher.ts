/** Shared, dependency-free data model for the teacher workspace and mini program. */
export type WorkPriority = 'high' | 'medium' | 'low';
export type WorkCategory = 'daily' | 'meeting' | 'exam' | 'activity' | 'material' | 'care' | 'incident';
export type WorkItem = {
  id: string; title: string; date: string; time: string; endDate?: string;
  priority: WorkPriority; category: WorkCategory; status: 'pending' | 'progress' | 'done' | 'cancelled';
  remind: boolean; remindBefore: number; notes: string; createdAt: string;
  completedAt?: string; source?: string; studentId?: string;
};
export type Student = {
  id: string; code: string; situation: string; interviews: {id: string; date: string; time?: string; content: string; action: string}[];
  followUpDate: string; createdAt: string;
};
export type Incident = {
  id: string; date: string; time: string; title: string; description: string; method: string; result: string;
  status: 'open' | 'followup' | 'closed'; folderId: string; studentId?: string;
  followUpDate: string; createdAt: string; closedAt?: string;
};
export type Meeting = {
  id: string; date: string; time: string; topic: string; content: string;
  status: 'planned' | 'held'; followUp: string; createdAt: string;
};
export type TeacherState = {
  version: 1; items: WorkItem[]; students: Student[]; incidents: Incident[]; meetings: Meeting[];
  folders: {id: string; name: string}[];
  settings: {
    teacherName: string; className: string; termName: string; termStart: string;
    meetingReminderDay: number; meetingReminderTime: string; quietStart: string; quietEnd: string;
  };
  quoteHistory: Record<string, number>;
};
export type ImportDraft = {
  title: string; date: string; time: string; priority: WorkPriority; category: WorkCategory;
  remind: boolean; notes: string; needsReview: boolean;
};

const DAY = 86400000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const priorities = ['high', 'medium', 'low'];
const categories = ['daily', 'meeting', 'exam', 'activity', 'material', 'care', 'incident'];

export function isTeacherDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** All user-visible dates use Asia/Shanghai, including completion timestamps. */
export function teacherToday(now: number = Date.now()): string {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new RangeError('无效的时间');
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function teacherAddDays(date: string, days: number): string {
  if (!isTeacherDate(date) || !Number.isInteger(days)) return '';
  const result = new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY);
  return Number.isFinite(result.getTime()) ? result.toISOString().slice(0, 10) : '';
}

export function teacherMonday(date: string): string {
  if (!isTeacherDate(date)) return '';
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return teacherAddDays(date, -((weekday + 6) % 7));
}

export function teacherId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const QUOTES: {text: string; kind: string}[] = [
  {kind:'加油',text:'今天认真完成的一件小事，也在让班级慢慢变好。'},
  {kind:'关怀',text:'先喝一口水，再处理下一件事。你的状态也值得照顾。'},
  {kind:'教育提醒',text:'先听学生把话说完，再一起寻找解决办法。'},
  {kind:'加油',text:'教育的变化有时很慢，你持续的耐心不会白费。'},
  {kind:'关怀',text:'工作之间给自己留几分钟，让肩膀和眼睛休息一下。'},
  {kind:'教育提醒',text:'讨论具体行为，避免用一个标签定义一个学生。'},
  {kind:'加油',text:'你不必一次解决所有问题，今天向前一步就很好。'},
  {kind:'关怀',text:'午饭尽量按时吃，照顾好自己也是认真工作的开始。'},
  {kind:'教育提醒',text:'批评前先核对事实，给学生解释和澄清的机会。'},
  {kind:'加油',text:'一次平静的沟通，也是一项值得记录的工作成果。'},
  {kind:'关怀',text:'可以把困难分给同事一起想办法，你无需独自承担。'},
  {kind:'教育提醒',text:'涉及学生隐私的内容，尽量选择合适的私下场合沟通。'},
  {kind:'加油',text:'看见学生微小的进步，也别忘记看见自己的努力。'},
  {kind:'关怀',text:'下班前写下明天最重要的一件事，让今晚少一点牵挂。'},
  {kind:'教育提醒',text:'情绪很满时，先暂停片刻，再决定怎样回应。'},
  {kind:'加油',text:'清楚地说出期待，往往比反复催促更有力量。'},
  {kind:'关怀',text:'久坐后起身走几步，给身体一点舒展的时间。'},
  {kind:'教育提醒',text:'学生之间的矛盾，先分别了解，再一起商量规则。'},
  {kind:'加油',text:'认真倾听的一分钟，可能成为学生愿意求助的起点。'},
  {kind:'关怀',text:'今天也给自己留一点与工作无关的快乐。'},
  {kind:'教育提醒',text:'把学生的困难记成待帮助的问题，而不是品行结论。'},
  {kind:'加油',text:'不急着追求完美，稳定而温和的坚持已经很珍贵。'},
  {kind:'关怀',text:'如果今天特别累，就把非紧急事项安排到更合适的时间。'},
  {kind:'教育提醒',text:'公开表扬可以具体，涉及困难的交流可以更私密。'},
  {kind:'加油',text:'班级的秩序，来自许多次清晰又耐心的说明。'},
  {kind:'关怀',text:'把呼吸放慢一点，先照顾此刻的自己。'},
  {kind:'教育提醒',text:'沟通时说出观察到的事实，也留意自己的推测。'},
  {kind:'加油',text:'今天愿意重新尝试，就是继续成长的开始。'},
  {kind:'关怀',text:'晚间工作可以设一个结束时间，休息也需要被安排。'},
  {kind:'教育提醒',text:'约定后续跟进时间，让一次谈话有清楚的下一步。'},
  {kind:'加油',text:'那些被你认真记下的小事，正在组成可靠的支持。'},
  {kind:'关怀',text:'忙碌时也可以向可信任的人说一句：我需要帮忙。'},
  {kind:'教育提醒',text:'避免当众比较学生，让每个人拥有自己的进步坐标。'},
  {kind:'加油',text:'一件事暂时没有结果，不代表你的努力没有意义。'},
  {kind:'关怀',text:'给眼睛一点远眺的时间，也给思绪一点空间。'},
  {kind:'教育提醒',text:'面对不同的表达方式，先确认自己是否理解了学生。'},
  {kind:'加油',text:'你为班级建立的每一个小习惯，都在积累力量。'},
  {kind:'关怀',text:'把今天做完的事划掉，允许自己感受到完成的轻松。'},
  {kind:'教育提醒',text:'教育中的边界说清楚，也让学生知道可以怎样求助。'},
  {kind:'加油',text:'温和与坚定可以同时存在，你正在练习这份平衡。'},
  {kind:'关怀',text:'适时放下手机，给今晚的睡眠留一点准备时间。'},
  {kind:'教育提醒',text:'记录事件时使用客观描述，区分事实、回应和待核实信息。'},
  {kind:'加油',text:'你愿意认真复盘，已经为下一次处理积累了经验。'},
  {kind:'关怀',text:'为自己安排一次短暂的散步，让一天有一个缓冲。'},
  {kind:'教育提醒',text:'家校沟通可以先说明共同目标，再讨论具体做法。'},
  {kind:'加油',text:'班级里平稳的一天，也有你默默付出的功劳。'},
  {kind:'关怀',text:'今天不必把待办清空，先完成最重要的部分。'},
  {kind:'教育提醒',text:'不要用羞辱、威胁或体罚推动改变，清晰规则更能建立信任。'},
  {kind:'加油',text:'每一次及时跟进，都是对学生认真而持续的关心。'},
  {kind:'关怀',text:'留意身体发出的疲惫信号，必要时给自己安排休息。'},
  {kind:'教育提醒',text:'面对复杂情况，及时寻求学校相关人员的支持。'},
  {kind:'加油',text:'允许计划调整，灵活应对也是你的一种能力。'},
  {kind:'关怀',text:'把今天最辛苦的一刻说出来，有时也能轻一点。'},
  {kind:'教育提醒',text:'学生的承诺需要适合他的步骤，也需要适时的鼓励。'},
  {kind:'加油',text:'你对细节的留心，可能正是学生需要的那份支持。'},
  {kind:'关怀',text:'别忘了为自己保留一顿安心吃完的饭。'},
  {kind:'教育提醒',text:'解决问题后再问一句：下一次我们可以怎样做？'},
  {kind:'加油',text:'一次有准备的班会，就是一次值得期待的相遇。'},
  {kind:'关怀',text:'完成工作后，给自己一个明确的收工信号。'},
  {kind:'教育提醒',text:'给学生选择时，让选项具体、可行，也符合共同规则。'},
];
export const QUOTE_COUNT = QUOTES.length;

/** Stable per day. Persist returned index in quoteHistory; reuse starts only after the pool is exhausted. */
export function dailyQuote(state: TeacherState, date: string = teacherToday()): {index: number; text: string; kind: string} {
  const previous = state.quoteHistory[date];
  if (Number.isInteger(previous) && previous >= 0 && previous < QUOTE_COUNT) return {index: previous, ...QUOTES[previous]};
  const history = Object.entries(state.quoteHistory).filter(([key, value]) => key < date && Number.isInteger(value) && value >= 0 && value < QUOTE_COUNT).sort(([a],[b]) => b.localeCompare(a));
  // After a complete cycle, avoid the most recent pool-length minus one entries.
  const used = new Set(history.slice(0, QUOTE_COUNT - 1).map(([, value]) => value));
  const seed = Array.from(date).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  let index = seed % QUOTE_COUNT;
  while (used.has(index)) index = (index + 1) % QUOTE_COUNT;
  return {index, ...QUOTES[index]};
}

export function createTeacherState(demo: boolean = false): TeacherState {
  const today = teacherToday();
  const year = Number(today.slice(0, 4));
  const semesterMonth = Number(today.slice(5, 7)) >= 8 ? '09' : '02';
  const state: TeacherState = {
    version: 1, items: [], students: [], incidents: [], meetings: [],
    folders: [{id: 'general', name: '待归档'}, {id: 'class', name: '班级日常'}, {id: 'followup', name: '重点跟进'}],
    settings: {teacherName:'班主任',className:'我的班级',termName:`${year}年${semesterMonth === '09' ? '秋季' : '春季'}学期`,termStart:`${year}-${semesterMonth}-01`,meetingReminderDay:1,meetingReminderTime:'16:30',quietStart:'21:00',quietEnd:'07:00'},
    quoteHistory: {},
  };
  if (!demo) return state;
  const now = new Date().toISOString();
  const d = (offset: number) => teacherAddDays(today, offset);
  const makeItem = (id: string, title: string, offset: number, time: string, category: WorkCategory, priority: WorkPriority = 'medium', status: WorkItem['status'] = 'pending'): WorkItem => ({id:`demo-${id}`,title,date:d(offset),time,priority,category,status,remind:true,remindBefore:30,notes:'示例数据，可编辑或删除。',createdAt:now,source:'示例',...(status === 'done' ? {completedAt:`${d(offset)}T12:00:00+08:00`} : {})});
  state.settings = {...state.settings, teacherName:'林老师',className:'七年级（3）班'};
  state.students = [
    {id:'demo-student-a',code:'S001',situation:'近期课堂参与减少，计划持续关注适应情况。（虚构示例）',interviews:[{id:'demo-interview-a',date:d(-2),time:'16:20',content:'学生表达对小组合作有些紧张。',action:'约定先承担记录工作，下周再交流。'},{id:'demo-interview-b',date:d(-8),time:'12:30',content:'了解新学期适应情况，学生希望获得更多参与活动的机会。',action:'观察下周活动参与情况。'}],followUpDate:d(2),createdAt:now},
    {id:'demo-student-b',code:'S002',situation:'作息调整中，与家长约定观察一周。（虚构示例）',interviews:[{id:'demo-interview-c',date:d(-1),time:'13:10',content:'共同讨论晚间作息，学生提出先固定收拾书包的时间。',action:'下周回顾作息计划。'}],followUpDate:d(4),createdAt:now},
  ];
  state.items = [makeItem('morning','晨检与学生到校情况确认',0,'07:40','daily','high'),makeItem('material','提交本周班级工作记录',0,'10:30','material','high'),makeItem('care','与 S001 做一次课后交流',0,'16:20','care'),makeItem('meeting','准备周一班会：从小习惯开始',1,'15:30','meeting'),makeItem('exam','期中考试考前安排确认',3,'09:00','exam','high'),makeItem('activity','班级阅读分享活动',4,'14:00','activity','low'),makeItem('finished','完成教室安全检查',-1,'16:00','daily','medium','done'),makeItem('overdue','整理上周家校沟通记录',-1,'17:00','material'),makeItem('semester','期中考试',10,'08:30','exam','high'),makeItem('sports','年级体育活动',17,'14:00','activity')];
  state.items[2].studentId = 'demo-student-a';
  state.items[3].source = 'meeting:demo-meeting-b';
  state.items[8].endDate = d(11); state.items[8].remindBefore = 1440;
  state.items.push({...makeItem('care-followup','S001 · 关爱跟进',2,'09:00','care'),studentId:'demo-student-a',source:'care:demo-student-a'}, {...makeItem('incident-followup','课间同学争执 · 事件复查',3,'09:00','incident'),source:'incident:demo-incident-a'});
  state.meetings = [{id:'demo-meeting-a',date:d(-4),time:'15:30',topic:'把班级规则变成共同约定',content:'分组讨论课间秩序，形成三条可执行的班级约定。',status:'held',followUp:'下周回顾约定执行情况。',createdAt:now},{id:'demo-meeting-b',date:d(1),time:'15:30',topic:'从小习惯开始',content:'计划邀请同学分享一个有帮助的学习习惯。',status:'planned',followUp:'',createdAt:now}];
  state.incidents = [{id:'demo-incident-a',date:d(-2),time:'10:10',title:'课间同学争执',description:'课间同学因借用文具发生争执。（虚构示例）',method:'先分别了解情况，再共同商定借用规则。',result:'双方澄清误会并道歉，约定一周后回访。',status:'followup',folderId:'followup',followUpDate:d(3),createdAt:now},{id:'demo-incident-b',date:d(-6),time:'14:10',title:'班级物品遗失查找',description:'活动结束后发现班级物品暂时找不到。（虚构示例）',method:'核对领用记录，联系活动负责人确认。',result:'物品已找到并归还，补充了领用归还登记。',status:'closed',folderId:'class',followUpDate:'',createdAt:now,closedAt:`${d(-5)}T16:00:00+08:00`}];
  return state;
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return !!value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function keys(value: RecordValue, required: string[], optional: string[] = []): boolean {
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function str(value: unknown, max = 20000): value is string { return typeof value === 'string' && value.length <= max; }
function nonempty(value: unknown, max = 500): value is string { return str(value, max) && value.trim().length > 0; }
function date(value: unknown, empty = true): boolean { return (empty && value === '') || isTeacherDate(value); }
function time(value: unknown, empty = true): boolean { return (empty && value === '') || typeof value === 'string' && TIME.test(value); }
function stamp(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && isTeacherDate(value.slice(0,10)) && Number.isFinite(Date.parse(value)); }
function one(value: unknown, options: string[]): boolean { return typeof value === 'string' && options.includes(value); }
function list(value: unknown): value is unknown[] { return Array.isArray(value) && value.length <= 50000; }
function unique(values: unknown[]): boolean { return new Set(values).size === values.length; }

/** Rejects malformed, duplicate, oversized or unrelated backups before replacing local data. */
export function validateTeacherState(value: unknown): value is TeacherState {
  try {
    if (!record(value) || !keys(value,['version','items','students','incidents','meetings','folders','settings','quoteHistory']) || value.version !== 1) return false;
    if (![value.items,value.students,value.incidents,value.meetings,value.folders].every(list)) return false;
    const items = value.items as unknown[], students = value.students as unknown[], incidents = value.incidents as unknown[], meetings = value.meetings as unknown[], folders = value.folders as unknown[];
    const settings = value.settings;
    if (!record(settings) || !keys(settings,['teacherName','className','termName','termStart','meetingReminderDay','meetingReminderTime','quietStart','quietEnd']) || !['teacherName','className','termName'].every(key=>str(settings[key],200)) || !date(settings.termStart) || !Number.isInteger(settings.meetingReminderDay) || (settings.meetingReminderDay as number)<1 || (settings.meetingReminderDay as number)>7 || !time(settings.meetingReminderTime,false) || !time(settings.quietStart,false) || !time(settings.quietEnd,false)) return false;
    if (!record(value.quoteHistory) || Object.keys(value.quoteHistory).length > 50000 || !Object.entries(value.quoteHistory).every(([key,index])=>isTeacherDate(key) && Number.isInteger(index) && (index as number)>=0 && (index as number)<QUOTE_COUNT)) return false;
    if (!folders.every(v=>record(v)&&keys(v,['id','name'])&&nonempty(v.id,200)&&nonempty(v.name,200))) return false;
    if (!students.every(v=>record(v)&&keys(v,['id','code','situation','interviews','followUpDate','createdAt'])&&nonempty(v.id,200)&&nonempty(v.code,200)&&str(v.situation)&&date(v.followUpDate)&&stamp(v.createdAt)&&list(v.interviews)&&v.interviews.every(i=>record(i)&&keys(i,['id','date','content','action'],['time'])&&nonempty(i.id,200)&&date(i.date,false)&&(i.time===undefined||time(i.time))&&nonempty(i.content,20000)&&str(i.action))&&unique(v.interviews.map(i=>(i as RecordValue).id)))) return false;
    const studentIds = new Set(students.map(v=>(v as RecordValue).id));
    const folderIds = new Set(folders.map(v=>(v as RecordValue).id));
    const studentRef = (v: RecordValue) => v.studentId === undefined || v.studentId === '' || typeof v.studentId === 'string' && studentIds.has(v.studentId);
    if (!items.every(v=>record(v)&&keys(v,['id','title','date','time','priority','category','status','remind','remindBefore','notes','createdAt'],['endDate','completedAt','source','studentId'])&&nonempty(v.id,200)&&nonempty(v.title,1000)&&date(v.date)&&time(v.time)&&(!v.time||!!v.date)&&one(v.priority,priorities)&&one(v.category,categories)&&one(v.status,['pending','progress','done','cancelled'])&&typeof v.remind==='boolean'&&Number.isInteger(v.remindBefore)&&(v.remindBefore as number)>=0&&(v.remindBefore as number)<=525600&&str(v.notes)&&stamp(v.createdAt)&&(v.endDate===undefined||date(v.endDate)&&(!v.endDate||!!v.date&&(v.endDate as string)>=(v.date as string)))&&(v.completedAt===undefined||stamp(v.completedAt))&&(v.source===undefined||str(v.source,1000))&&studentRef(v))) return false;
    if (!incidents.every(v=>record(v)&&keys(v,['id','date','time','title','description','method','result','status','folderId','followUpDate','createdAt'],['studentId','closedAt'])&&nonempty(v.id,200)&&date(v.date,false)&&time(v.time)&&nonempty(v.title,1000)&&str(v.description)&&str(v.method)&&str(v.result)&&one(v.status,['open','followup','closed'])&&typeof v.folderId==='string'&&(v.folderId===''||folderIds.has(v.folderId))&&date(v.followUpDate)&&stamp(v.createdAt)&&(v.closedAt===undefined||stamp(v.closedAt))&&studentRef(v))) return false;
    if (!meetings.every(v=>record(v)&&keys(v,['id','date','time','topic','content','status','followUp','createdAt'])&&nonempty(v.id,200)&&date(v.date,false)&&time(v.time)&&nonempty(v.topic,1000)&&str(v.content)&&one(v.status,['planned','held'])&&str(v.followUp)&&stamp(v.createdAt))) return false;
    return [items,students,incidents,meetings,folders].every(group=>unique(group.map(v=>(v as RecordValue).id))) && unique(students.map(v=>(v as RecordValue).code));
  } catch { return false; }
}

const chineseNumber: Record<string,number> = {'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
function number(text: string): number {
  if (/^\d+$/.test(text)) return Number(text);
  if (text.includes('十')) { const [tens, units] = text.split('十'); return (tens ? chineseNumber[tens] : 1)*10+(units ? chineseNumber[units] : 0); }
  return chineseNumber[text] ?? NaN;
}
function monthDate(year: number, month: number, day: number): string {
  const value = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return isTeacherDate(value) ? value : '';
}
function inferCategory(line: string): WorkCategory {
  if (/班会|主题教育|班队会/.test(line)) return 'meeting';
  if (/考试|期中|期末|测验|监考|阅卷/.test(line)) return 'exam';
  if (/突发|冲突|争执|受伤|事件处理/.test(line)) return 'incident';
  if (/访谈|谈心|关爱|心理|家访|家校|家长沟通/.test(line)) return 'care';
  if (/材料|报表|统计表|上报|提交|填报|名单|收集/.test(line)) return 'material';
  if (/活动|运动会|比赛|春游|秋游|演出|阅读分享/.test(line)) return 'activity';
  return 'daily';
}

/** Local text extraction creates reviewable drafts; ambiguous dates are never silently set to today. */
export function parseWorkText(text: string, baseDate: string = teacherToday()): ImportDraft[] {
  const base = isTeacherDate(baseDate) ? baseDate : teacherToday();
  const year = Number(base.slice(0,4));
  let inheritedDate = '';
  let inheritedReview = false;
  const result: ImportDraft[] = [];
  const lines = text.replace(/\r/g,'').split(/[\n；;]/).map(value=>value.trim()).filter(Boolean).slice(0,1000);
  for (const original of lines) {
    let line = original.replace(/^\s*(?:[-*•·]\s*|[（(]?[一二三四五六七八九十\d]+[）)、]\s*|[一二三四五六七八九十\d]+[.．](?!\d)\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)/,'').trim();
    if (!line) continue;
    let dateValue = '', explicit = false, review = false;
    const iso = line.match(/(?<!\d)(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?!\d)/);
    const md = line.match(/(?<!\d)(\d{1,2})月(\d{1,2})[日号]?/);
    const short = line.match(/(?<!\d)(\d{1,2})[/.](\d{1,2})(?![\d/.])/);
    const week = line.match(/(下下|下|本|这)?(?:周|星期|礼拜)([一二三四五六日天])/);
    const relative = line.match(/大后天|后天|明天|今天|昨日|昨天/);
    let dateToken = '';
    if (iso) { explicit = true; dateToken = iso[0]; dateValue = monthDate(Number(iso[1]),Number(iso[2]),Number(iso[3])); }
    else if (md) { explicit = true; dateToken = md[0]; dateValue = monthDate(year,Number(md[1]),Number(md[2])); }
    else if (short) { explicit = true; dateToken = short[0]; dateValue = monthDate(year,Number(short[1]),Number(short[2])); }
    else if (relative) { explicit = true; dateToken = relative[0]; dateValue = teacherAddDays(base,({'大后天':3,'后天':2,'明天':1,'今天':0,'昨日':-1,'昨天':-1} as Record<string,number>)[relative[0]]); }
    else if (week) {
      explicit = true; dateToken = week[0];
      const day = '一二三四五六日'.indexOf(week[2] === '天' ? '日' : week[2]);
      dateValue = teacherAddDays(teacherMonday(base),day+(week[1]==='下下'?14:week[1]==='下'?7:0));
    }
    if (explicit && !dateValue) review = true;
    // Multiple dates/ranges require review instead of inventing a single deadline.
    if (/至|到|[~～]/.test(line) && /日期|\d|周|星期/.test(line)) review = true;
    if (dateToken) line = line.replace(dateToken,'').trim();
    if (!explicit) { dateValue = inheritedDate; review = inheritedReview; }

    let timeValue = '', timeToken = '';
    const clock = line.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})[:：](\d{2})/);
    const hanClock = line.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*([零〇一二两三四五六七八九十\d]{1,3})[点时](?:([零〇一二两三四五六七八九十\d]{1,3})分?|([半整]))?/);
    const match = clock || hanClock;
    if (match) {
      timeToken = match[0];
      let hour = number(match[2]);
      const minute = clock ? Number(match[3]) : match[4]==='半'?30:match[3]?number(match[3]):0;
      if (['下午','晚上'].includes(match[1]) && hour<12) hour += 12;
      if (match[1] === '中午' && hour<11) hour += 12;
      if (match[1] === '凌晨' && hour===12) hour = 0;
      timeValue = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
      if (!TIME.test(timeValue)) { timeValue = ''; review = true; }
      if (!match[1] && hour>=1 && hour<=6) review = true;
      line = line.replace(timeToken,'').trim();
    }
    line = line.replace(/^[\s:：,，、-]+|[\s:：,，、]+$/g,'').trim();
    // A standalone date heading applies to following numbered rows.
    if (!line || /^(工作安排|安排|周程|事项|工作)$/.test(line)) {
      if (explicit) { inheritedDate = dateValue; inheritedReview = review; }
      continue;
    }
    if (explicit) { inheritedDate = ''; inheritedReview = false; }
    if (line.length > 1000) { line = line.slice(0,1000); review = true; }
    const priority: WorkPriority = /紧急|重要|务必|立即|加急|必须|截止|最迟/.test(original)?'high':/可选|有空|不急|择机/.test(original)?'low':'medium';
    result.push({title:line,date:dateValue,time:timeValue,priority,category:inferCategory(original),remind:true,notes:`原文：${original}`,needsReview:review||!dateValue});
  }
  return result;
}

function timestampDate(value: string | undefined, fallback: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return fallback;
  return teacherToday(Date.parse(value));
}
export function teacherStats(state: TeacherState, start: string, end: string): {completed:number;incidentNew:number;incidentClosed:number;meetings:number;interviews:number;pending:number} {
  const within = (value: string) => isTeacherDate(value) && value>=start && value<=end;
  return {
    completed:state.items.filter(item=>item.status==='done'&&within(timestampDate(item.completedAt,item.date))).length,
    incidentNew:state.incidents.filter(item=>within(item.date)).length,
    incidentClosed:state.incidents.filter(item=>item.status==='closed'&&within(timestampDate(item.closedAt,item.date))).length,
    meetings:state.meetings.filter(item=>item.status==='held'&&within(item.date)).length,
    interviews:state.students.reduce((sum,student)=>sum+student.interviews.filter(item=>within(item.date)).length,0),
    pending:state.items.filter(item=>(item.status==='pending'||item.status==='progress')&&within(item.date)).length,
  };
}

export function escapeTeacherHtml(value: string): string {
  return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}
/** A self-contained printable archive. User text is always escaped, never executable markup. */
export function printArchiveHtml(title: string, headers: string[], rows: string[][]): string {
  const escape = escapeTeacherHtml;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;color:#20352f;margin:32px}h1{font-size:24px}p{font-size:12px;color:#65756f}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #b7c8c0;padding:12px;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#edf4f0}tr{break-inside:avoid}thead{display:table-header-group}@page{size:A4 landscape;margin:16mm}@media print{body{margin:0}button{display:none}}button{padding:8px 16px;border:1px solid #b7c8c0;border-radius:6px;background:white;margin-bottom:16px}</style></head><body><h1>${escape(title)}</h1><p>导出日期：${teacherToday()}</p><button type="button" onclick="window.print()">打印 / 保存为 PDF</button><table><thead><tr>${headers.map(header=>`<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headers.map((_,index)=>`<td>${escape(row[index]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
}
