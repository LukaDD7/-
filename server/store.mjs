import {emptyState,validateState} from '../lib/planner.ts';
export async function getPlan(db,userId){
 await db.query('INSERT INTO shixu_plans(user_id,state_json) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO NOTHING',[userId,JSON.stringify(emptyState())]);
 const {rows}=await db.query('SELECT revision,state_json,updated_at FROM shixu_plans WHERE user_id=$1',[userId]);
 return {revision:rows[0].revision,state:rows[0].state_json,updatedAt:rows[0].updated_at};
}
export async function savePlan(db,userId,revision,state){
 if(!Number.isInteger(revision)||revision<0||!validateState(state))return {status:400,error:'计划数据格式不正确'};
 const {rows}=await db.query('UPDATE shixu_plans SET state_json=$1::jsonb,revision=revision+1,updated_at=now() WHERE user_id=$2 AND revision=$3 RETURNING revision,updated_at',[JSON.stringify(state),userId,revision]);
 if(!rows.length)return {status:409,error:'其他设备已更新这份计划，请先处理同步冲突'};
 return {status:200,revision:rows[0].revision,updatedAt:rows[0].updated_at};
}
