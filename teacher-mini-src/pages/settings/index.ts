import {teacherStore,message,confirm} from '../../store';
import {createTeacherState,teacherToday,QUOTE_COUNT} from '../../core/teacher';
import {teacherMiniConfig} from '../../config';
const weekdays=[{value:1,label:'每周一'},{value:2,label:'每周二'},{value:3,label:'每周三'},{value:4,label:'每周四'},{value:5,label:'每周五'},{value:6,label:'每周六'},{value:7,label:'每周日'}];
Page({data:{form:{},weekdays,dayIndex:0,error:'',templateId:teacherMiniConfig.subscribeTemplateId,quoteCount:QUOTE_COUNT,shownQuotes:0},
 onShow(){const s=teacherStore.state();let template=teacherMiniConfig.subscribeTemplateId;try{template=wx.getStorageSync('qinghe.teacher.subscribe-template')||template;}catch{}this.setData({form:{...s.settings},dayIndex:Math.max(0,weekdays.findIndex(d=>d.value===s.settings.meetingReminderDay)),error:teacherStore.error(),shownQuotes:new Set(Object.values(s.quoteHistory)).size,templateId:template});},
 input(e:any){this.setData({['form.'+e.currentTarget.dataset.field]:e.detail.value});},
 day(e:any){const index=Number(e.detail.value);this.setData({dayIndex:index,'form.meetingReminderDay':weekdays[index].value});},
 save(){try{const f=this.data.form as any;if(!f.teacherName.trim()||!f.className.trim()||!f.termName.trim())throw new Error('请填写教师称呼、班级与学期');if(!f.termStart)throw new Error('请选择学期开始日期');teacherStore.commit({...teacherStore.state(),settings:{...f,teacherName:f.teacherName.trim(),className:f.className.trim(),termName:f.termName.trim()}});this.setData({error:''});message('工作台设置已保存到本机');}catch(e){this.setData({error:e instanceof Error?e.message:String(e)});}},
 template(e:any){this.setData({templateId:e.detail.value.trim()});},
 subscribe(){const id=this.data.templateId.trim();if(!id){wx.showModal({title:'微信提醒尚未接入',content:'需要在微信公众平台申请对应的订阅模板，并配置服务端定时任务。目前各模块只保存提醒偏好，不会发送微信消息。',showCancel:false});return;}if(!/^[A-Za-z0-9_-]{20,100}$/.test(id)){message('请填写有效的微信订阅消息模板 ID');return;}try{wx.setStorageSync('qinghe.teacher.subscribe-template',id);}catch{message('模板 ID 保存失败');return;}wx.requestSubscribeMessage({tmplIds:[id],success:(r:any)=>wx.showModal({title:r[id]==='accept'?'本次订阅已授权':'本次订阅未授权',content:r[id]==='accept'?'已记录本次授权结果。定时发送后台仍未接入，当前版本不会主动发送微信提醒。':'你仍可正常使用待办和日程，提醒偏好会保留。',showCancel:false}),fail:(e:any)=>message(e.errMsg||'订阅授权失败，请核对模板和小程序 AppID')});},
 async export(){try{await teacherStore.export(!!teacherStore.error());}catch(e){message(e);}},
 async import(){try{await teacherStore.import();this.onShow();}catch(e){message(e);}},
 async clear(){if(!(await confirm('清空本机工作资料？','这会删除当前小程序的工作、学生、访谈和事件资料。请先导出备份，此操作无法撤销。')))return;try{teacherStore.replace(createTeacherState(false));this.onShow();message('已清空，可以开始自己的记录');}catch(e){message(e);}},
 async restoreDemo(){if(!(await confirm('恢复示例资料？','示例将替换当前本机资料。请先导出备份。')))return;try{teacherStore.replace(createTeacherState(true));this.onShow();message('已恢复示例资料');}catch(e){message(e);}},
});
