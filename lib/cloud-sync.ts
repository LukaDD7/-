import type {PlannerState} from './planner';
export type CloudPlan={state:PlannerState;revision:number;updatedAt?:string};
export type SyncStatus='saved'|'waiting'|'saving'|'offline'|'conflict'|'expired'|'rejected';
type Transport=(method:'GET'|'PUT',body?:unknown)=>Promise<{status:number;data:any}>;
export class CloudSync {
 state:PlannerState; revision:number; status:SyncStatus='saved';
 private committed:string; private busy=false; private pulling=false; private alive=true;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private retryTimer:ReturnType<typeof setTimeout>|null=null;private failures=0;
 private transport:Transport; private changed:(status:SyncStatus,state?:PlannerState)=>void;
 private retryDelays:readonly number[];
 constructor(plan:CloudPlan,transport:Transport,changed:CloudSync['changed'],options:{retryDelays?:readonly number[]}={}){
  this.transport=transport;this.changed=changed;this.state=plan.state;this.revision=plan.revision;this.committed=JSON.stringify(plan.state);
  this.retryDelays=options.retryDelays?.length?options.retryDelays:[2000,5000,10000,30000];
 }
 get dirty(){return JSON.stringify(this.state)!==this.committed;}
 private clearRetry(){if(this.retryTimer)clearTimeout(this.retryTimer);this.retryTimer=null;}
 private emit(status:SyncStatus,state?:PlannerState){
  if(!this.alive)return;this.status=status;
  if(['saved','conflict','expired','rejected'].includes(status))this.clearRetry();
  if(status==='saved')this.failures=0;
  this.changed(status,state);
 }
 private retryLater(){
  if(!this.alive||this.retryTimer||this.status!=='offline')return;
  const delay=this.retryDelays[Math.min(this.failures++,this.retryDelays.length-1)];
  this.retryTimer=setTimeout(()=>{this.retryTimer=null;if(this.alive&&this.status==='offline')void(this.dirty?this.flush():this.pull());},delay);
 }
 mark(state:PlannerState){
  this.state=state;if(this.status==='conflict'||this.status==='expired')return;
  if(this.timer)clearTimeout(this.timer);
  this.emit(this.dirty?'waiting':'saved');
  if(this.dirty)this.timer=setTimeout(()=>void this.flush(),700);
 }
 conflict(){this.emit('conflict');}
 async flush(){
  if(!this.alive||this.busy||['conflict','expired','rejected'].includes(this.status))return;
  this.clearRetry();this.busy=true;
  try{
   while(this.alive&&this.dirty){
    this.emit('saving');const sent=this.state,fingerprint=JSON.stringify(sent);
    const response=await this.transport('PUT',{revision:this.revision,state:sent});if(!this.alive)return;
    if(response.status===401){this.emit('expired');return;}
    if(response.status===409){this.emit('conflict');return;}
    if(response.status>=400&&response.status<500&&response.status!==429){this.emit('rejected');return;}
    if(response.status!==200)throw new Error('save_failed');
    this.revision=response.data.revision;this.committed=fingerprint;
   }
   this.emit('saved');
  }catch{this.emit('offline');this.retryLater();}finally{this.busy=false;}
 }
 async pull(){
  if(!this.alive||this.busy||this.pulling||this.dirty||['conflict','expired','rejected'].includes(this.status))return;
  const originalRevision=this.revision;this.pulling=true;
  try{const response=await this.transport('GET');if(!this.alive)return;
   if(response.status===401){this.emit('expired');return;}if(response.status!==200)throw new Error('load_failed');
   if(this.busy||this.dirty||this.revision!==originalRevision)return;
   if(response.data.revision!==this.revision){this.state=response.data.state;this.revision=response.data.revision;this.committed=JSON.stringify(this.state);this.emit('saved',this.state);}else this.emit('saved');
  }catch{if(this.alive&&!this.busy&&this.revision===originalRevision&&!['conflict','expired','rejected'].includes(this.status)){this.emit('offline');this.retryLater();}}finally{this.pulling=false;}
 }
 async reconnect(){
  if(['conflict','expired','rejected'].includes(this.status))return;
  this.clearRetry();this.failures=0;await(this.dirty?this.flush():this.pull());
 }
 async resolve(useLocal:boolean){
  try{const response=await this.transport('GET');if(!this.alive)return;if(response.status===401){this.emit('expired');return;}if(response.status!==200)throw new Error('load_failed');
   this.revision=response.data.revision;this.committed=JSON.stringify(response.data.state);
   if(!useLocal){this.state=response.data.state;this.emit('saved',this.state);}else{this.emit('waiting');await this.flush();}
  }catch{this.emit('conflict');}
 }
 dispose(){this.alive=false;this.clearRetry();if(this.timer)clearTimeout(this.timer);}
}
