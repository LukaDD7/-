import {teacherStore,sorted,categoryNames,go,message} from '../../store';
import {teacherToday,teacherAddDays,teacherMonday} from '../../core/teacher';
const weekdays=['一','二','三','四','五','六','日'];
Page({data:{day:teacherToday(),mode:'week',days:[],items:[],category:'all',weekdays,monthLabel:'',termWeek:1},
 onShow(){this.render();},
 render(){const s=teacherStore.state(),day=this.data.day,month=day.slice(0,7),first=month+'-01',mode=this.data.mode,start=mode==='week'?teacherMonday(day):teacherMonday(first),count=mode==='week'?7:42;
 const days=Array.from({length:count},(_,i)=>{const d=teacherAddDays(start,i),n=s.items.filter(w=>w.status!=='cancelled'&&w.date<=d&&(w.endDate||w.date)>=d).length;return{date:d,label:Number(d.slice(8)),today:d===teacherToday(),selected:d===day,dim:d.slice(0,7)!==month,count:n};});
 const items=sorted(s.items.filter(i=>i.status!=='cancelled'&&i.date<=day&&(i.endDate||i.date)>=day&&(this.data.category==='all'||i.category===this.data.category))).map((i,index)=>({...i,no:index+1,categoryName:categoryNames[i.category]}));
 const termWeek=Math.max(1,Math.floor((Date.parse(day+'T00:00:00+08:00')-Date.parse(teacherMonday(s.settings.termStart)+'T00:00:00+08:00'))/604800000)+1);
 this.setData({days,items,monthLabel:`${Number(day.slice(0,4))}年${Number(day.slice(5,7))}月`,termWeek,settings:s.settings,error:teacherStore.error(),meetingCount:s.meetings.filter(m=>m.date===day).length});
 },
 mode(e:any){this.setData({mode:e.currentTarget.dataset.mode});this.render();},
 select(e:any){this.setData({day:e.currentTarget.dataset.date});this.render();},
 pick(e:any){this.setData({day:e.detail.value});this.render();},
 prev(){this.move(-1);},next(){this.move(1);},move(n:number){const d=this.data.day;if(this.data.mode==='week')this.setData({day:teacherAddDays(d,n*7)});else{const date=new Date(d+'T12:00:00Z');date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+n);this.setData({day:date.toISOString().slice(0,10)});}this.render();},
 today(){this.setData({day:teacherToday()});this.render();},
 category(e:any){this.setData({category:e.currentTarget.dataset.category});this.render();},
 edit(e:any){go('item',e.currentTarget.dataset.id);},
 add(){go('item','','&date='+this.data.day);},import(){wx.navigateTo({url:'/pages/import/index'});},
 remind(e:any){const s=teacherStore.state();try{teacherStore.commit({...s,items:s.items.map(i=>i.id===e.currentTarget.dataset.id?{...i,remind:!i.remind}:i)});this.render();message('已保存提醒偏好；微信推送未连接');}catch(e){message(e);}},
});
