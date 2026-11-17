'use client';
import {useEffect,useRef,useState} from 'react';
import {demoState,emptyState,validateState,type PlannerState} from '@/lib/planner';
import {CloudSync,type SyncStatus} from '@/lib/cloud-sync';
import type {CloudContext} from '@/components/cloud-gate';
export function usePlanStorage(cloud?:CloudContext){
 const [state,setState]=useState<PlannerState>(emptyState()),[ready,setReady]=useState(false),[saveError,setSaveError]=useState(false),[syncStatus,setSyncStatus]=useState<SyncStatus>('saved');
 const client=useRef<CloudSync|null>(null),stateRef=useRef(state);stateRef.current=state;
 const key=cloud?`shixu.cloud.${cloud.user.id}`:'shixu.planner.v1';
 useEffect(()=>{
  let initial=cloud?.plan.state||demoState();let cached:any;
  try{const raw=localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(cloud){if(parsed.dirty&&validateState(parsed.state)&&Number.isInteger(parsed.revision)&&parsed.revision>=0){initial=parsed.state;cached=parsed;}}else if(validateState(parsed))initial=parsed;}}
  catch{setSaveError(true);}
  if(cloud){
   let instance:CloudSync;
   const transport=async(method:'GET'|'PUT',body?:unknown)=>{const r=await fetch('/api/state',{method,headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
   instance=new CloudSync(cloud.plan,transport,(status,newState)=>{
    setSyncStatus(status);if(newState){stateRef.current=newState;setState(newState);}
    try{localStorage.setItem(key,JSON.stringify({state:instance.state,revision:instance.revision,dirty:instance.dirty}));setSaveError(false);}catch{setSaveError(true);}
    if(status==='expired')cloud.expired();
   });
   client.current=instance;
   if(cached){instance.mark(initial);if(cached.revision!==cloud.plan.revision){instance.revision=cached.revision;instance.conflict();}}
  }
  stateRef.current=initial;setState(initial);setReady(true);
  const poll=setInterval(()=>{if(document.visibilityState==='visible'&&client.current?.status==='saved')void client.current.pull();},15000);
  const online=()=>{void client.current?.reconnect();};window.addEventListener('online',online);
  const visible=()=>{if(document.visibilityState==='visible'&&client.current?.status==='offline')void client.current.reconnect();};document.addEventListener('visibilitychange',visible);
  const unload=(e:BeforeUnloadEvent)=>{if(client.current?.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);
  return()=>{client.current?.dispose();client.current=null;clearInterval(poll);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);window.removeEventListener('beforeunload',unload);};
 },[cloud?.user.id]);
 useEffect(()=>{if(!ready)return;if(cloud){client.current?.mark(state);}else try{localStorage.setItem(key,JSON.stringify(state));setSaveError(false);}catch{setSaveError(true);}},[state,ready,cloud?.user.id]);
 return {state,setState,ready,saveError,syncStatus,retry:()=>client.current?.reconnect(),loadCloud:()=>client.current?.resolve(false),keepLocal:()=>client.current?.resolve(true)};
}
