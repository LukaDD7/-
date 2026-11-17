import {store,watch,unwatch,message} from '../../store';
import {dateKey,addDays,clock,durationLabel,remainingMinutes,schedule,toggleTaskComplete} from '../../core/planner';
Page({
 data:{signedIn:false,day:dateKey(),tasks:[],blocks:[],events:[],showCompleted:false},
 onShow(){watch(this,()=>this.render());void store.refresh();},onHide(){unwatch(this);store.onHide();},onUnload(){unwatch(this);},
 render(){const snap=store.snapshot(),state=snap.state,day=this.data.day;const taskMap=new Map(state.tasks.map(t=>[t.id,t]));
  const tasks=state.tasks.filter(t=>this.data.showCompleted?t.completed:!t.completed).map(t=>({...t,remaining:durationLabel(remainingMinutes(t)),worked:durationLabel(t.workedMinutes||0)}));
  const blocks=state.blocks.filter(b=>dateKey(b.start)===day&&!taskMap.get(b.taskId)?.completed).map(b=>({...b,title:taskMap.get(b.taskId)?.title,time:`${clock(b.start)} – ${clock(b.end)}`}));
  const events=state.events.filter(e=>dateKey(e.start)===day).map(e=>({...e,time:`${clock(e.start)} – ${clock(e.end)}`}));
  this.setData({...snap,signedIn:true,tasks,blocks,events,dateLabel:day,warningCount:new Set(schedule(state).warnings.map(w=>w.taskId)).size,statusText:({saved:'云端已保存',waiting:'等待同步',saving:'正在同步',offline:'网络断开，正在重试',conflict:'同步冲突待处理',expired:'请重新登录',rejected:'保存未被接受，请检查'} as any)[snap.status]});
 },
 date(e:any){this.setData({day:e.detail.value});this.render();},prev(){this.setData({day:addDays(this.data.day,-1)});this.render();},next(){this.setData({day:addDays(this.data.day,1)});this.render();},today(){this.setData({day:dateKey()});this.render();},
 edit(e:any){wx.navigateTo({url:'/pages/task/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});},add(){wx.navigateTo({url:'/pages/task/index'});},fixed(){wx.navigateTo({url:'/pages/event/index'});},editEvent(e:any){wx.navigateTo({url:'/pages/event/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 toggle(e:any){try{store.commit(toggleTaskComplete(store.snapshot().state,e.currentTarget.dataset.id));}catch(e){message(e);}},
 replan(){try{store.commit(store.snapshot().state);wx.showToast({title:'已按剩余时间重排',icon:'none'});}catch(e){message(e);}},
 completed(){this.setData({showCompleted:!this.data.showCompleted});this.render();},review(){wx.switchTab({url:'/pages/review/index'});},login(){wx.navigateTo({url:'/pages/login/index'});},
 cloud(){void store.resolve(false);},local(){wx.showModal({title:'覆盖云端计划？',content:'将使用本机这份计划覆盖云端更新。可先在“我的”导出备份。',success:(r:any)=>{if(r.confirm)void store.resolve(true);}});},retry(){void store.refresh();},undo(){try{store.undo();}catch(e){message(e);}},
});
