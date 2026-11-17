import {randomUUID} from 'node:crypto';
import {dateKey} from '../lib/planner.ts';
export async function beginUsage(db,userId,model){
 const id=randomUUID();
 await db.query('INSERT INTO shixu_ai_usage(id,user_id,model) VALUES($1,$2,$3)',[id,userId,model]);
 return id;
}
export async function finishUsage(db,id,status,durationMs,usage){
 const outcome=status>=200&&status<300?'success':status>=400&&status<500&&status!==429?'rejected':'error';
 await db.query(`UPDATE shixu_ai_usage SET outcome=$2,http_status=$3,duration_ms=$4,provider_called=$5,prompt_tokens=$6,completion_tokens=$7,total_tokens=$8 WHERE id=$1`,[id,outcome,status,Math.max(0,Math.round(durationMs)),usage?.providerCalled===true,usage?.promptTokens??null,usage?.completionTokens??null,usage?.totalTokens??null]);
}
export async function getUsage(db,userId,now=Date.now()){
 const today=dateKey(now),month=today.slice(0,7)+'-01';
 const summary=async(day)=>{
  const {rows}=await db.query(`SELECT count(*)::int AS requests,count(*) FILTER (WHERE outcome='success')::int AS succeeded,count(*) FILTER (WHERE outcome='error')::int AS failed,count(*) FILTER (WHERE outcome='rejected')::int AS rejected,count(*) FILTER (WHERE outcome='pending')::int AS pending,count(*) FILTER (WHERE provider_called)::int AS provider_calls,count(total_tokens)::int AS metered_calls,coalesce(sum(prompt_tokens),0)::bigint AS prompt_tokens,coalesce(sum(completion_tokens),0)::bigint AS completion_tokens,coalesce(sum(total_tokens),0)::bigint AS total_tokens FROM shixu_ai_usage WHERE user_id=$1 AND created_at >= $2::timestamptz`,[userId,day+'T00:00:00+08:00']);
  return Object.fromEntries(Object.entries(rows[0]).map(([key,value])=>[key,Number(value)]));
 };
 const [daySummary,monthSummary,recent]=await Promise.all([summary(today),summary(month),db.query('SELECT model,outcome,http_status,duration_ms,provider_called,prompt_tokens,completion_tokens,total_tokens,created_at FROM shixu_ai_usage WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',[userId])]);
 return {today:daySummary,month:monthSummary,recent:recent.rows,timezone:'Asia/Shanghai',since:'v0.4',pricingConfigured:false};
}
