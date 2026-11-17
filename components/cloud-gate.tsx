'use client';
import {useEffect,useState,type ReactNode,type FormEvent} from 'react';
import {Leaf,ArrowRight,LoaderCircle} from 'lucide-react';
import type {CloudPlan} from '@/lib/cloud-sync';
import {validateState} from '@/lib/planner';
export type CloudContext={user:{id:string;email:string;displayName:string};plan:CloudPlan;logout:()=>Promise<void>;expired:()=>void};
export function CloudGate({children}:{children:(cloud?:CloudContext)=>ReactNode}){
 const [mode,setMode]=useState<'loading'|'local'|'cloud'>('loading'),[bundle,setBundle]=useState<Omit<CloudContext,'logout'|'expired'>|null>(null);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){
  const me=await fetch('/api/auth/me');if(me.status===401){setBundle(null);return;}
  if(!me.ok)throw new Error('无法连接后台，请稍后重试');
  const user=(await me.json() as {user:CloudContext['user']}).user;
  const response=await fetch('/api/state');if(!response.ok)throw new Error('无法载入云端计划');
  const plan=await response.json() as CloudPlan;if(!validateState(plan.state)||!Number.isInteger(plan.revision))throw new Error('云端数据格式异常，请稍后重试');
  setBundle({user,plan});
 }
 useEffect(()=>{if(document.querySelector('meta[name="shixu-runtime"]')?.getAttribute('content')!=='cloud'){setMode('local');return;}setMode('cloud');setBusy(true);load().catch(e=>setError(e.message)).finally(()=>setBusy(false));},[]);
 async function login(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error||'登录失败');setPassword('');await load();}catch(e){setError(e instanceof Error?e.message:'无法登录');}finally{setBusy(false);}}
 async function logout(){try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw new Error('退出失败，请联网后重试');setBundle(null);setError('');}catch(e){setError(e instanceof Error?e.message:'退出失败');}}
 if(mode==='local')return children();
 if(bundle)return <>{error&&<div className="cloud-global-error" role="alert">{error}</div>}{children({...bundle,logout,expired:()=>{setBundle(null);setError('登录已过期，请重新登录。未同步的修改仍保存在本浏览器。');}})}</>;
 return <main className="login-page"><section className="login-card"><span className="login-brand"><Leaf size={28}/>时序<span>.</span></span><div className="eyebrow">A LITTLE SPACE FOR WHAT MATTERS.</div><h1>你的计划，<br/>在每个设备上继续。</h1><p>登录后，任务和日程会自动保存到你的云端空间。</p>{mode==='loading'?<p>正在连接…</p>:<form onSubmit={login}><label>邮箱<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="你的账号邮箱"/></label><label>密码<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} placeholder="登录密码"/></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<ArrowRight size={17}/>} {busy?'正在连接…':'进入我的计划'}</button><button type="button" className="text-button" onClick={()=>{setError('');setBusy(true);load().catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>重新连接</button></form>}<span className="login-caption">试用账号由管理员创建 · 数据按账号独立保存</span></section></main>;
}
