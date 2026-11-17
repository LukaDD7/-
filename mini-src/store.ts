import {call,request,session,wechatCode,APIError} from './api';
import {config} from './config';
import {CloudSync} from './core/cloud-sync';
import {emptyState,schedule,validateState,type PlannerState} from './core/planner';
export type Access={status:string;canUse:boolean;canExport:boolean;dailyLimit:number;dailyUsed:number;endsAt?:string;quotaPolicy?:string};
let sync:CloudSync|null=null,user:any=null,access:Access|null=null,loading:Promise<void>|null=null,error='',undo:PlannerState|null=null,cacheError=false;
const listeners=new Set<()=>void>();
const cacheKey=()=>`shixu.mini.plan:${config.apiBase}:${user?.id}`;
const emit=()=>listeners.forEach(fn=>fn());
function cached(){if(!sync||!user)return;try{wx.setStorageSync(cacheKey(),{state:sync.state,revision:sync.revision,dirty:sync.dirty});cacheError=false;}catch{cacheError=true;}}
function install(plan:any){
 sync?.dispose();let instance:CloudSync;
 instance=new CloudSync(plan,(method,body)=>request('/api/state',method,body),(status)=>{cached();if(status==='expired'){session.clear();user=null;access=null;error='登录已过期，请重新登录';}emit();});sync=instance;
 const cache=wx.getStorageSync(cacheKey());
 if(cache?.dirty&&validateState(cache.state)&&Number.isInteger(cache.revision)&&cache.revision>=0){instance.mark(cache.state);if(cache.revision!==plan.revision){instance.revision=cache.revision;instance.conflict();}}
 cached();
}
export const store={
 subscribe(fn:()=>void){listeners.add(fn);return()=>listeners.delete(fn);},
 snapshot(){return {user,access,state:sync?.state||emptyState(),status:sync?.status||'saved',dirty:sync?.dirty||false,error,cacheError,canUndo:!!undo};},
 async boot(){
  if(loading)return loading;if(user&&sync&&session.get())return;if(!session.get()){emit();return;}
  loading=(async()=>{try{const me=await call('/api/auth/me');user=me.user;access=me.access;if(!access?.canExport){error='当前账号暂无访问资格';emit();return;}install(await call('/api/state'));error='';emit();}catch(e){if(e instanceof APIError&&e.status===401){session.clear();user=null;access=null;}error=e instanceof Error?e.message:'打开失败';emit();}})().finally(()=>{loading=null;});return loading;
 },
 async refresh(){if(!session.get())return;try{access=await call('/api/access');if(!sync&&access?.canExport)install(await call('/api/state'));if(sync&&access?.canExport)await sync.reconnect();error='';emit();}catch(e){error=e instanceof Error?e.message:'连接失败';emit();}},
 async login(inviteCode:string,linkTicket:string){
  const result=await call('/api/auth/wechat','POST',{code:await wechatCode(),...(inviteCode?{inviteCode}:{}),...(linkTicket?{linkTicket}:{})},false);
  sync?.dispose();sync=null;undo=null;session.set(result.token);user=result.user;access=result.access;error='';await store.boot();
 },
 commit(next:PlannerState,replan=true){if(!access?.canUse)throw new Error('内测权益不可用，请联系管理员');if(!sync)throw new Error('请先连接云端');if(!validateState(next))throw new Error('任务数据不正确，尚未保存');undo=sync.state;sync.mark(replan?{...next,blocks:schedule(next).blocks}:next);cached();emit();},
 undo(){if(undo){const previous=undo;store.commit(previous,false);undo=null;emit();}},
 async resolve(local:boolean){await sync?.resolve(local);cached();emit();},
 async flush(){await sync?.flush();},
 async logout(){await call('/api/auth/logout','POST',{});sync?.dispose();sync=null;session.clear();user=null;access=null;undo=null;error='';emit();},
 async export(){if(!user)throw new Error('请先登录');const file=`${wx.env.USER_DATA_PATH}/shixu-backup-${Date.now()}.json`;const data=JSON.stringify(sync?.state||(await call('/api/state')).state,null,2);await new Promise<void>((resolve,reject)=>wx.getFileSystemManager().writeFile({filePath:file,data,encoding:'utf8',success:()=>resolve(),fail:()=>reject(new Error('备份保存失败'))}));await new Promise<void>((resolve,reject)=>wx.shareFileMessage({filePath:file,fileName:'时序备份.json',success:()=>resolve(),fail:()=>reject(new Error('分享未完成，备份文件仍保留在本机'))}));},
 onHide(){void sync?.flush();},
};
let counter=0;
export const newId=()=>`mini-${Date.now().toString(36)}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2,14)}`;
export const message=(e:unknown)=>wx.showToast({title:e instanceof Error?e.message:String(e),icon:'none',duration:3000});
export function watch(page:any,render:()=>void){const update=()=>{if(!store.snapshot().user){page.setData({signedIn:false});return;}render();};page._unwatch=store.subscribe(update);update();void store.boot().then(update);}
export function unwatch(page:any){page._unwatch?.();page._unwatch=null;}
