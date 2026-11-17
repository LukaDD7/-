import {config} from './config';
export class APIError extends Error {status:number;code:string;constructor(status:number,data:any){super(data?.error||'服务暂不可用');this.status=status;this.code=data?.code||'';}}
const key=()=>`shixu.mini.session:${config.apiBase}`;
export const session={get:()=>wx.getStorageSync(key())||'',set:(token:string)=>wx.setStorageSync(key(),token),clear:()=>wx.removeStorageSync(key())};
export function request(path:string,method='GET',data?:unknown,auth=true):Promise<{status:number;data:any}>{
 if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(config.apiBase))return Promise.reject(new Error('管理员尚未配置 HTTPS 服务地址'));
 return new Promise((resolve,reject)=>wx.request({url:config.apiBase+path,method,data,timeout:path==='/api/plan'&&method==='POST'?70000:15000,header:{'Content-Type':'application/json',...(auth&&session.get()?{Authorization:`Bearer ${session.get()}`}:{})},success:(r:any)=>resolve({status:r.statusCode,data:r.data}),fail:()=>reject(new Error('网络连接失败，请检查连接后重试'))}));
}
export async function call(path:string,method='GET',data?:unknown,auth=true){const r=await request(path,method,data,auth);if(r.status<200||r.status>=300)throw new APIError(r.status,r.data);return r.data;}
export const wechatCode=():Promise<string>=>new Promise((resolve,reject)=>wx.login({timeout:10000,success:(r:any)=>r.code?resolve(r.code):reject(new Error('未获得微信登录凭证')),fail:()=>reject(new Error('微信登录失败，请重试'))}));
