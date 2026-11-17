import {teacherStore,categoryNames,priorityNames,sorted,go,message,confirm} from '../../store';
import {teacherToday,teacherAddDays,teacherMonday,teacherStats,dailyQuote} from '../../core/teacher';
Page({
 data:{today:'',tab:'today',sort:'time',items:[],quote:{},stats:{},followUps:[],incidents:[],unrecorded:0,error:'',demo:false},
 onShow(){this.render();},
 render(){const state=teacherStore.state(),today=teacherToday(),quote=dailyQuote(state,today);if(state.quoteHistory[today]!==quote.index){try{teacherStore.commit({...state,quoteHistory:{...state.quoteHistory,[today]:quote.index}});}catch(e){message(e);}}
 const active=state.items.filter(i=>i.status!=='cancelled');const view=this.data.tab;
 const items=sorted(active.filter(i=>view==='today'?i.date===today&&i.status!=='done':view==='overdue'?i.date&&i.date<today&&i.status!=='done':view==='done'?i.status==='done':i.status!=='done'),this.data.sort).map(i=>({...i,categoryName:categoryNames[i.category],priorityName:priorityNames[i.priority]}));
 const stats=teacherStats(state,teacherMonday(today),teacherAddDays(teacherMonday(today),6));
 const localClock=new Date(Date.now()+8*3600000).toISOString().slice(11,16),weekday=new Date(today+'T12:00:00Z').getUTCDay()||7;
 const meetingNudge=weekday===state.settings.meetingReminderDay&&localClock>=state.settings.meetingReminderTime&&!state.meetings.some(m=>m.date>=teacherMonday(today)&&m.date<=teacherAddDays(teacherMonday(today),6)&&m.topic.trim());
 this.setData({today,items,quote,stats,meetingNudge,settings:state.settings,error:teacherStore.error(),demo:state.items.some(i=>i.id.startsWith('demo-')),todayCount:active.filter(i=>i.date===today&&i.status!=='done').length,overdueCount:active.filter(i=>i.date&&i.date<today&&i.status!=='done').length,followUps:state.students.filter(s=>s.followUpDate&&s.followUpDate<=today).map(s=>({id:s.id,code:s.code,date:s.followUpDate,followUpDate:s.followUpDate})),incidents:state.incidents.filter(i=>i.status!=='closed'),unrecorded:state.meetings.filter(m=>m.date<=today&&m.status==='planned').length});},
 tab(e:any){this.setData({tab:e.currentTarget.dataset.tab});this.render();},
 sort(){this.setData({sort:this.data.sort==='time'?'priority':'time'});this.render();},
 add(){go('item');},incident(){go('incident');},meeting(){go('meeting');},import(){wx.navigateTo({url:'/pages/import/index'});},
 edit(e:any){go('item',e.currentTarget.dataset.id);},student(e:any){go('student',e.currentTarget.dataset.id);},event(e:any){go('incident',e.currentTarget.dataset.id);},
 toggle(e:any){try{teacherStore.toggle(e.currentTarget.dataset.id);this.render();}catch(e){message(e);}},
 remind(e:any){const state=teacherStore.state();try{teacherStore.commit({...state,items:state.items.map(i=>i.id===e.currentTarget.dataset.id?{...i,remind:!i.remind}:i)});this.render();message('已保存提醒偏好；微信推送未连接');}catch(e){message(e);}},
 archives(){wx.switchTab({url:'/pages/archive/index'});},
 async clearDemo(){if(!(await confirm('清空示例资料？','只清除标记为示例的数据，保留你自己创建的工作和档案。')))return;const s=teacherStore.state();try{teacherStore.commit({...s,items:s.items.filter(x=>!x.id.startsWith('demo-')).map(x=>({...x,studentId:x.studentId?.startsWith('demo-')?undefined:x.studentId,source:x.source&&/^(care|incident|meeting):demo-/.test(x.source)?undefined:x.source})),students:s.students.filter(x=>!x.id.startsWith('demo-')),incidents:s.incidents.filter(x=>!x.id.startsWith('demo-')).map(x=>({...x,studentId:x.studentId?.startsWith('demo-')?undefined:x.studentId})),meetings:s.meetings.filter(x=>!x.id.startsWith('demo-'))});this.render();}catch(e){message(e);}}
});
