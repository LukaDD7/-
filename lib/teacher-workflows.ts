import {teacherId, type TeacherState, type WorkItem} from './teacher.ts';

type LinkedWork = Omit<WorkItem, 'id' | 'createdAt'>;
const isFollowUp = (source: string) => source.startsWith('care:') || source.startsWith('incident:');
const archived = (item: WorkItem, source: string): WorkItem => ({...item, source:`history:${source}:${item.id}`});

/** Update the current linked appointment without rewriting completed follow-up history. */
export function linkTeacherWork(next: TeacherState, source: string, item: LinkedWork | null): TeacherState {
  const previous = next.items.find(work => work.source === source);
  const remaining = next.items.filter(work => work.source !== source);
  const followUp = isFollowUp(source);
  if (!item) {
    const history = followUp ? next.items.filter(work => work.source === source && work.status === 'done').map(work => archived(work, source)) : [];
    return {...next, items:[...remaining, ...history]};
  }

  const sameAppointment = previous?.date === item.date && previous?.time === item.time;
  const preserveHistory = followUp && previous?.status === 'done' && !sameAppointment;
  const work: WorkItem = {
    ...item,
    id:preserveHistory ? teacherId() : previous?.id || teacherId(),
    createdAt:preserveHistory ? new Date().toISOString() : previous?.createdAt || new Date().toISOString(),
    source,
  };

  if (followUp && previous && sameAppointment) {
    work.status = previous.status;
    work.completedAt = previous.completedAt;
    work.remind = previous.remind;
    work.remindBefore = previous.remindBefore;
  } else if (preserveHistory) {
    work.status = 'pending';
    delete work.completedAt;
  } else if (source.startsWith('meeting:')) {
    if (previous) {
      work.remind = previous.remind;
      work.remindBefore = previous.remindBefore;
    }
    // Editing an already held meeting must not move its completion into this week's report.
    if (work.status === 'done') work.completedAt = previous?.completedAt || item.completedAt;
    else delete work.completedAt;
  }

  return {...next, items:[...remaining, ...(preserveHistory && previous ? [archived(previous,source)] : []), work]};
}

/** Remove fictional examples while retaining personal records and valid foreign references. */
export function clearTeacherDemo(state: TeacherState): TeacherState {
  const demo = (id: string) => id.startsWith('demo-');
  const removedStudents = new Set(state.students.filter(student => demo(student.id)).map(student => student.id));
  const demoSource = (source: string | undefined): boolean => {
    if (!source) return false;
    // Also catches linked examples whose parent was already removed by an older client.
    const parent = source.match(/^(?:history:)?(?:meeting|care|student|incident):([^:]+)(?::.*)?$/)?.[1];
    return !!parent && demo(parent);
  };
  const cleanStudentReference = <T extends {studentId?: string}>(value: T): T => {
    if (!value.studentId || !removedStudents.has(value.studentId) && !demo(value.studentId)) return value;
    const clean = {...value};
    delete clean.studentId;
    return clean;
  };
  return {
    ...state,
    items:state.items.filter(work => !demo(work.id) && !demoSource(work.source)).map(cleanStudentReference),
    students:state.students.filter(student => !demo(student.id)),
    incidents:state.incidents.filter(incident => !demo(incident.id)).map(cleanStudentReference),
    meetings:state.meetings.filter(meeting => !demo(meeting.id)),
  };
}

/** One completion action updates the shared calendar item and its parent meeting together. */
export function toggleTeacherWork(state: TeacherState, id: string, nowISO: string = new Date().toISOString()): TeacherState {
  const item = state.items.find(work => work.id === id);
  if (!item) return state;
  const completed = item.status !== 'done';
  const parentId = item.source?.startsWith('meeting:') ? item.source.slice('meeting:'.length) : undefined;
  return {
    ...state,
    items:state.items.map(work => work.id === id ? {...work, status:completed ? 'done' : 'pending', completedAt:completed ? nowISO : undefined} : work),
    meetings:parentId ? state.meetings.map(meeting => meeting.id === parentId ? {...meeting,status:completed ? 'held' : 'planned'} : meeting) : state.meetings,
  };
}
