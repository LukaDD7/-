export type Priority = 'high' | 'medium' | 'low';
export type Category = 'work' | 'personal' | 'study';
export type Task = {
  id: string; title: string; minutes: number; workedMinutes?: number; deadline: string; priority: Priority;
  category: Category; splittable: boolean; completed: boolean; locked: boolean;
  notBefore?: string; notBeforeTime?: string; deadlineTime?: string; dependsOn?: string[]; recurrence: 'none' | 'daily' | 'weekly'; notes: string;
};
export type Block = { id: string; taskId: string; start: number; end: number };
export type CalendarEvent = { id: string; title: string; start: number; end: number };
export type Settings = { workStart: string; workEnd: string; lunchStart: string; lunchEnd: string; weekends: boolean; breakMinutes: number };
export type PlannerState = { version: 1; tasks: Task[]; events: CalendarEvent[]; blocks: Block[]; settings: Settings };
export type ScheduleWarning = { taskId: string; message: string; suggestions?: string[]; availableMinutes?: number; largestSlotMinutes?: number };
export type ScheduleResult = { blocks: Block[]; warnings: ScheduleWarning[] };

export const DEFAULT_SETTINGS: Settings = { workStart: '09:00', workEnd: '18:00', lunchStart: '12:00', lunchEnd: '13:00', weekends: false, breakMinutes: 10 };
export const uid = () => globalThis.crypto.randomUUID();
export function dateKey(time = Date.now()) { return new Date(time + 8 * 3600000).toISOString().slice(0, 10); }
export function addDays(day: string, n: number) { return new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
export function at(day: string, clock: string) { return Date.parse(`${day}T${clock}:00+08:00`); }
export function clock(time: number) { return new Date(time + 8 * 3600000).toISOString().slice(11, 16); }
export function monday(day: string) { const d = new Date(day + 'T00:00:00Z').getUTCDay(); return addDays(day, -(d === 0 ? 6 : d - 1)); }
export function labelDate(day: string) { const d = new Date(day + 'T00:00:00Z'); return `${d.getUTCMonth()+1}月${d.getUTCDate()}日`; }
export function durationLabel(minutes: number) { return minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}` : `${minutes}分钟`; }
export const validClock = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function remainingMinutes(task: Task) { return task.completed ? 0 : Math.max(0, task.minutes - (task.workedMinutes || 0)); }
export function taskStart(task: Task, now: number) { return task.notBefore ? at(task.notBefore, task.notBeforeTime || '00:00') : now; }
export function taskEnd(task: Task) { return task.deadline ? at(task.deadline, task.deadlineTime || '23:59') : Infinity; }
export function validateSettings(s: Settings): string | null {
  if (![s.workStart,s.workEnd,s.lunchStart,s.lunchEnd].every(x => /^([01]\d|2[0-3]):[0-5]\d$/.test(x))) return '请填写有效时间';
  if (s.workStart >= s.workEnd) return '工作结束时间必须晚于开始时间';
  if (s.lunchStart >= s.lunchEnd || s.lunchStart < s.workStart || s.lunchEnd > s.workEnd) return '午休应位于工作时间内，结束时间晚于开始时间';
  if (!Number.isFinite(s.breakMinutes) || s.breakMinutes < 0 || s.breakMinutes > 60) return '任务间休息应在 0～60 分钟之间';
  return null;
}

type Interval = { start: number; end: number };
function subtract(source: Interval[], occupied: Interval): Interval[] {
  return source.flatMap(slot => {
    if (occupied.end <= slot.start || occupied.start >= slot.end) return [slot];
    const pieces: Interval[] = [];
    if (occupied.start > slot.start) pieces.push({ start: slot.start, end: occupied.start });
    if (occupied.end < slot.end) pieces.push({ start: occupied.end, end: slot.end });
    return pieces;
  });
}

/** Deterministic scheduling in Asia/Shanghai; fixed commitments are hard constraints. */
export function schedule(state: PlannerState, now = Date.now(), horizonDays = 21): ScheduleResult {
  const { tasks, events, settings } = state;
  const result: Block[] = [];
  const warnings: ScheduleResult['warnings'] = [];
  if (validateSettings(settings)) return { blocks: state.blocks, warnings: tasks.filter(t=>!t.completed).map(t=>({taskId:t.id,message:'工作时间设置无效，请先调整'})) };
  const first = dateKey(now);
  let free: Interval[] = [];
  const ceilNow = Math.ceil(now / 300000) * 300000;
  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(first, i);
    const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
    if (!settings.weekends && (weekday === 0 || weekday === 6)) continue;
    for (const [start,end] of [[settings.workStart,settings.lunchStart],[settings.lunchEnd,settings.workEnd]]) {
      const slot = { start: Math.max(at(day,start),ceilNow), end: at(day,end) };
      if (slot.end > slot.start) free.push(slot);
    }
  }
  for (const event of events) free = subtract(free,event);
  const gap = settings.breakMinutes * 60000;
  const locked = tasks.filter(t => !t.completed && t.locked);
  for (const task of locked) {
    const blocks = state.blocks.filter(b => b.taskId === task.id);
    if (blocks.length && Math.round(blocks.reduce((sum,b)=>sum+(b.end-b.start)/60000,0))!==remainingMinutes(task)) warnings.push({taskId:task.id,message:'锁定时段与剩余耗时不一致，请解锁重排'});
    if (!blocks.length) { warnings.push({ taskId:task.id,message:'任务没有锁定时段，请解锁后重新安排' }); continue; }
    for (const block of blocks) {
      result.push(block);
      free = subtract(free,{ start:block.start-gap,end:block.end+gap });
      if (block.start < now) warnings.push({taskId:task.id,message:'锁定时段已开始或已过，请完成任务或解锁重排'});
      else if (events.some(e=>block.start<e.end && block.end>e.start)) warnings.push({taskId:task.id,message:'锁定时段与固定日程冲突，请手动调整'});
      else if (block.start<taskStart(task,now)) warnings.push({taskId:task.id,message:'锁定时段早于最早开始时间，请解锁后重新安排',suggestions:['解锁时间，保留新的开始约束']});
      else if (block.end>taskEnd(task)) warnings.push({taskId:task.id,message:'锁定时段晚于截止时间，请手动调整',suggestions:['解锁并重排，或修改截止时间']});
    }
  }
  const score = (t:Task) => {
    const deadline = t.deadline ? Math.max(-3, (taskEnd(t) - now)/86400000) : horizonDays;
    return deadline * 2 - ({high:6,medium:2,low:0}[t.priority]);
  };
  const movable = tasks.filter(t=>!t.completed&&!t.locked).sort((a,b)=>score(a)-score(b)||(a.deadline||'9999').localeCompare(b.deadline||'9999')||a.id.localeCompare(b.id));
  const failed = new Set<string>();
  while (movable.length) {
    const broken = movable.findIndex(t=>(t.dependsOn||[]).some(id=>!tasks.some(x=>x.id===id)||failed.has(id)));
    if(broken>=0){const [task]=movable.splice(broken,1);failed.add(task.id);warnings.push({taskId:task.id,message:'前置任务未能安排或已删除，请先调整前置任务'});continue;}
    const ready=movable.findIndex(t=>(t.dependsOn||[]).every(id=>tasks.find(x=>x.id===id)?.completed||result.some(b=>b.taskId===id)));
    if(ready<0){for(const task of movable)warnings.push({taskId:task.id,message:'前置任务未安排或存在循环依赖，请修改任务依赖'});break;}
    const [task]=movable.splice(ready,1);
    const needed = remainingMinutes(task);
    if(needed===0){failed.add(task.id);warnings.push({taskId:task.id,message:'已投入达到预计总耗时，请确认完成或补充剩余耗时',suggestions:['如果已经做完，标为完成','如需继续，更新剩余预计耗时']});continue;}
    let remaining = needed * 60000;
    const dependencyEnds=(task.dependsOn||[]).flatMap(id=>tasks.find(t=>t.id===id)?.completed?[]:result.filter(b=>b.taskId===id).map(b=>b.end+gap));
    const earliest = Math.max(now,taskStart(task,now),...dependencyEnds);
    const due = taskEnd(task);
    const staged: Block[] = [];
    const before = free.map(x=>({...x}));
    for (let idx=0; idx<free.length && remaining>0; idx++) {
      const slot = free[idx];
      const start = Math.max(slot.start,earliest);
      const available = Math.min(slot.end,due)-start;
      if (available<=0) continue;
      if (!task.splittable && available<remaining) continue;
      let amount = task.splittable ? Math.min(remaining,available,90*60000) : remaining;
      amount = Math.floor(amount/300000)*300000;
      if (task.splittable && amount < Math.min(remaining,30*60000)) continue;
      if (amount<=0) continue;
      const end=start+amount;
      staged.push({id:`${task.id}-${staged.length}`,taskId:task.id,start,end});
      remaining-=amount;
      free=subtract(free,{start:start-gap,end:end+gap});
      idx=-1;
    }
    // All-or-nothing allocation: no silently truncated work or misleading plans.
    if (remaining>0) {
      free=before;
      failed.add(task.id);
      const lengths=before.map(slot=>Math.max(0,Math.floor((Math.min(slot.end,due)-Math.max(slot.start,earliest))/300000)*5));
      const availableMinutes=lengths.reduce((sum,n)=>sum+n,0),largestSlotMinutes=Math.max(0,...lengths);
      let message:string,suggestions:string[];
      if(due<=now){message='截止时间已过，无法安排到过去';suggestions=['修改截止日期或时间，再重新安排'];}
      else if(taskStart(task,now)>due){message='最早开始时间晚于截止时间，指定范围无效';suggestions=['将开始时间提前，或将截止时间延后'];}
      else if(earliest>=at(addDays(first,horizonDays),'00:00')){message=`最早可开始的时间超出未来 ${horizonDays} 天排程范围`;suggestions=['临近开始日期时重新安排，或提前最早开始日期'];}
      else if(!task.splittable&&availableMinutes>=needed&&largestSlotMinutes<needed){message=`需要连续 ${needed} 分钟，最长空闲时段只有 ${largestSlotMinutes} 分钟`;suggestions=['允许拆成多个专注时段','调整固定日程或延后截止时间'];}
      else if(availableMinutes<needed){message=`需要 ${needed} 分钟，当前时间范围内最多只有 ${availableMinutes} 分钟空闲`;suggestions=['延后截止时间或提前最早开始时间','缩短任务耗时，或调整工作时间与固定日程'];}
      else{message=`空闲时段较碎，保留休息后放不下 ${needed} 分钟的任务`;suggestions=['延后截止时间','调整任务间休息，或缩短任务耗时'];}
      warnings.push({taskId:task.id,message,suggestions,availableMinutes,largestSlotMinutes});
    } else result.push(...staged);
  }
  for(const task of locked){for(const id of task.dependsOn||[]){const parent=tasks.find(t=>t.id===id);if(parent?.completed)continue;const parents=result.filter(b=>b.taskId===id),children=result.filter(b=>b.taskId===task.id);if(!parent||!parents.length||Math.max(...parents.map(b=>b.end))>Math.min(...children.map(b=>b.start)))warnings.push({taskId:task.id,message:'锁定时段不满足前置任务顺序，请解锁重排'});}}
  return {blocks:result.sort((a,b)=>a.start-b.start),warnings};
}

export function moveBlock(state: PlannerState, blockId: string, newStart:number, now=Date.now()): {state?:PlannerState;error?:string} {
  const block=state.blocks.find(b=>b.id===blockId);
  if(!block)return{error:'没有找到该日程'};
  const task=state.tasks.find(t=>t.id===block.taskId);
  if(!task||task.completed)return{error:'已完成的任务不能移动'};
  const newEnd=newStart+(block.end-block.start);
  for(const id of task.dependsOn||[]){const parent=state.tasks.find(t=>t.id===id);if(parent?.completed)continue;const blocks=state.blocks.filter(b=>b.taskId===id);if(!parent||!blocks.length||newStart<Math.max(...blocks.map(b=>b.end)))return{error:'前置任务尚未完成或安排在后，请先调整前置任务'};}
  const siblings=state.blocks.filter(b=>b.taskId===task.id&&b.id!==blockId);
  const latestEnd=Math.max(newEnd,...siblings.map(b=>b.end));
  for(const child of state.tasks.filter(t=>!t.completed&&(t.dependsOn||[]).includes(task.id))){const blocks=state.blocks.filter(b=>b.taskId===child.id);if(blocks.length&&latestEnd>Math.min(...blocks.map(b=>b.start)))return{error:'这个移动会打乱后续任务的顺序，请先解锁并重新安排'};}
  if(newStart<now)return{error:'请选择未来的时间'};
  if(newStart<taskStart(task,now))return{error:'不能早于任务的最早开始时间'};
  if(newEnd>taskEnd(task))return{error:'不能移动到截止时间之后，请先延期'};
  const day=dateKey(newStart),weekday=new Date(day+'T00:00:00Z').getUTCDay();
  const s=state.settings;
  if(!s.weekends&&(weekday===0||weekday===6))return{error:'周末未开放，请先调整工作时间'};
  if(newStart<at(day,s.workStart)||newEnd>at(day,s.workEnd)||(newStart<at(day,s.lunchEnd)&&newEnd>at(day,s.lunchStart)))return{error:'请选择工作时间内、午休以外的时段'};
  const gap=s.breakMinutes*60000;
  if(state.events.some(e=>newStart<e.end&&newEnd>e.start)||state.blocks.some(b=>b.id!==blockId&&newStart<b.end+gap&&newEnd>b.start-gap))return{error:'该时段已有安排或需要保留休息时间'};
  return{state:{...state,tasks:state.tasks.map(t=>t.id===task.id?{...t,locked:true}:t),blocks:state.blocks.map(b=>b.id===blockId?{...b,start:newStart,end:newEnd}:b)}};
}

export function emptyState():PlannerState {return{version:1,tasks:[],events:[],blocks:[],settings:{...DEFAULT_SETTINGS}};}
export function demoState(now=Date.now()):PlannerState {
  const today=dateKey(now);
  const tasks:Task[]=[
    {title:'梳理产品第一版需求',minutes:90,priority:'high',category:'work',deadline:addDays(today,2),notes:'明确核心流程、功能边界与验收标准'},
    {title:'阅读《深度工作》',minutes:45,priority:'medium',category:'study',deadline:addDays(today,4),notes:'读完一章，整理三个值得实践的方法'},
    {title:'完成竞品体验记录',minutes:120,priority:'high',category:'work',deadline:addDays(today,3),notes:'体验任务录入与自动安排，记录操作成本'},
    {title:'安排本周运动计划',minutes:30,priority:'low',category:'personal',deadline:addDays(today,5),notes:'选好三次运动的时间与项目'},
    {title:'整理项目资料',minutes:60,priority:'medium',category:'work',deadline:addDays(today,4),notes:''},
  ].map((t,i)=>({...t,id:`demo-${i}`,splittable:true,completed:false,locked:false,recurrence:'none'} as Task));
  const events:CalendarEvent[]=[{id:'demo-meeting',title:'产品讨论',start:at(addDays(today,1),'10:00'),end:at(addDays(today,1),'10:45')}];
  const state={...emptyState(),tasks,events};
  return{...state,blocks:schedule(state,now).blocks};
}

export function validateState(input: unknown): input is PlannerState {
  if(!input||typeof input!=='object')return false;
  const s=input as PlannerState;
  if(s.version!==1||!s.settings||typeof s.settings.weekends!=='boolean'||validateSettings(s.settings)||!Array.isArray(s.tasks)||!Array.isArray(s.events)||!Array.isArray(s.blocks)||s.tasks.length>1000||s.events.length>1000||s.blocks.length>5000)return false;
  const validDay=(v:unknown)=>typeof v==='string'&&(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(at(v,'00:00'))&&dateKey(at(v,'00:00'))===v);
  const ids=new Set<string>();
  for(const t of s.tasks){
    if(!t||typeof t.id!=='string'||ids.has(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>200||!Number.isFinite(t.minutes)||t.minutes<5||t.minutes>2400||t.minutes%5!==0||!['high','medium','low'].includes(t.priority)||!['work','study','personal'].includes(t.category)||!['none','daily','weekly'].includes(t.recurrence)||typeof t.notes!=='string'||t.notes.length>5000||typeof t.completed!=='boolean'||typeof t.locked!=='boolean'||typeof t.splittable!=='boolean'||!(t.deadline===''||validDay(t.deadline))||(t.notBefore&&!validDay(t.notBefore)))return false;
    if(t.workedMinutes!==undefined&&(!Number.isInteger(t.workedMinutes)||t.workedMinutes<0||t.workedMinutes%5!==0||t.workedMinutes>t.minutes))return false;
    if(t.dependsOn&&(!Array.isArray(t.dependsOn)||t.dependsOn.length>100||!t.dependsOn.every(id=>typeof id==='string')))return false;
    if(t.notBeforeTime!==undefined&&t.notBeforeTime!==''&&(!validClock(t.notBeforeTime)||!validDay(t.notBefore)))return false;
    if(t.deadlineTime!==undefined&&t.deadlineTime!==''&&(!validClock(t.deadlineTime)||!validDay(t.deadline)))return false;
    ids.add(t.id);
  }
  for(const e of s.events)if(!e||typeof e.id!=='string'||typeof e.title!=='string'||!e.title.trim()||e.title.length>200||!Number.isFinite(e.start)||!Number.isFinite(e.end)||e.end<=e.start)return false;
  const blockIds=new Set<string>();
  for(const b of s.blocks){if(!b||typeof b.id!=='string'||blockIds.has(b.id)||!ids.has(b.taskId)||!Number.isFinite(b.start)||!Number.isFinite(b.end)||b.end<=b.start)return false;blockIds.add(b.id);}
  return true;
}

export type ReviewItem = { task: Task; reasons: string[]; overdue: boolean; missed: boolean; warning?: ScheduleWarning };
/** Review is read-only: the user's deadline and locked times are never changed implicitly. */
export function dailyReview(state: PlannerState, now = Date.now()): ReviewItem[] {
  const today = dateKey(now), warnings = schedule(state, now).warnings;
  return state.tasks.filter(task => !task.completed).flatMap(task => {
    const overdue = taskEnd(task) < now;
    const missed = state.blocks.some(block => block.taskId === task.id && block.end <= now);
    const warning = warnings.find(item => item.taskId === task.id);
    const reasons = [
      ...(overdue ? ['已超过截止时间'] : task.deadline === today ? ['今天截止'] : []),
      ...(missed ? ['之前安排的时段已过，任务尚未完成'] : []),
      ...(warning && !overdue ? [warning.message] : []),
    ];
    return reasons.length ? [{task, reasons, overdue, missed, warning}] : [];
  }).sort((a,b) => Number(b.overdue)-Number(a.overdue) || Number(b.missed)-Number(a.missed) || taskEnd(a.task)-taskEnd(b.task) || a.task.id.localeCompare(b.task.id));
}

export function toggleTaskComplete(state: PlannerState, taskId: string, now = Date.now()): PlannerState {
  const task=state.tasks.find(item=>item.id===taskId);
  if(!task)return state;
  let tasks=state.tasks.map(item=>item.id===taskId?{...item,completed:!item.completed,locked:false}:item);
  if(!task.completed&&task.recurrence!=='none'&&!tasks.some(item=>item.id===`${task.id}-next`)){
    const today=dateKey(now),base=task.deadline&&task.deadline>today?task.deadline:today;
    const nextDue=addDays(base,task.recurrence==='daily'?1:7);
    tasks=[...tasks,{...task,id:`${task.id}-next`,deadline:nextDue,notBefore:nextDue,workedMinutes:0,completed:false,locked:false}];
  }
  return {...state,tasks};
}
