import {randomBytes,randomUUID} from 'node:crypto';
import {tokenHash} from './auth.mjs';
import {dateKey} from '../lib/planner.ts';
export const accessError=(message,status=403,code='access_denied')=>Object.assign(new Error(message),{status,code});
export async function transaction(db,fn){
 if(db.transaction)return db.transaction(fn);
 const client=await db.connect();
 try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
 catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function getAccess(db,userId){
 const {rows}=await db.query(`SELECT u.account_status,u.access_mode,e.plan_code,e.source,e.starts_at,e.ends_at,e.daily_ai_limit,e.status,coalesce(q.used_count,0) AS used_count FROM shixu_users u LEFT JOIN shixu_entitlements e ON e.user_id=u.id LEFT JOIN shixu_daily_ai q ON q.user_id=u.id AND q.day=$2::date WHERE u.id=$1`,[userId,dateKey()]);
 const row=rows[0];if(!row)return {status:'blocked',canUse:false,canExport:false,dailyLimit:0,dailyUsed:0};
 const legacy=row.access_mode==='legacy'&&!row.source,active=row.status==='active'&&new Date(row.starts_at).getTime()<=Date.now()&&new Date(row.ends_at).getTime()>Date.now();
 const status=row.account_status!=='active'||row.status==='suspended'?'blocked':legacy||active?'active':row.ends_at&&new Date(row.ends_at).getTime()<=Date.now()?'expired':'pending';
 return {status,canUse:status==='active',canExport:status==='active'||status==='expired',planCode:legacy?'internal-legacy':row.plan_code||'internal',source:legacy?'existing-account':row.source||null,endsAt:row.ends_at||null,dailyLimit:legacy?20:row.daily_ai_limit||0,dailyUsed:Number(row.used_count),quotaPolicy:'每次有效 AI 请求占用一次额度，失败也计次；北京时间零点重置。'};
}
export async function reserveAI(db,userId){
 // Eligibility and the counter are checked in one database statement across workers.
 const {rows}=await db.query(`INSERT INTO shixu_daily_ai(user_id,day,used_count)
 SELECT u.id,$2::date,1 FROM shixu_users u LEFT JOIN shixu_entitlements e ON e.user_id=u.id
 WHERE u.id=$1 AND u.account_status='active' AND (e.status IS NULL OR e.status<>'suspended')
 AND ((u.access_mode='legacy' AND e.user_id IS NULL) OR (e.status='active' AND e.starts_at<=now() AND e.ends_at>now()))
 AND (CASE WHEN (u.access_mode='legacy' AND e.user_id IS NULL) THEN 20 ELSE coalesce(e.daily_ai_limit,0) END)>0
 ON CONFLICT(user_id,day) DO UPDATE SET used_count=shixu_daily_ai.used_count+1
 WHERE shixu_daily_ai.used_count<(SELECT CASE WHEN (u.access_mode='legacy' AND e.user_id IS NULL) THEN 20 ELSE coalesce(e.daily_ai_limit,0) END FROM shixu_users u LEFT JOIN shixu_entitlements e ON e.user_id=u.id WHERE u.id=$1)
 RETURNING used_count`,[userId,dateKey()]);
 return rows.length>0;
}
export async function createInvite(db,{maxUses=1,validDays=14,grantDays=30,dailyLimit=20}={}){
 for(const [value,max] of [[maxUses,1000],[validDays,90],[grantDays,366]])if(!Number.isInteger(value)||value<1||value>max)throw accessError('邀请参数不正确',400);
 if(!Number.isInteger(dailyLimit)||dailyLimit<0||dailyLimit>1000)throw accessError('额度参数不正确',400);
 const code='SX-'+randomBytes(16).toString('hex').toUpperCase(),id=randomUUID();
 await db.query(`INSERT INTO shixu_invites(id,code_hash,max_uses,expires_at,grant_days,daily_ai_limit) VALUES($1,$2,$3,now()+$4*interval '1 day',$5,$6)`,[id,tokenHash(code),maxUses,validDays,grantDays,dailyLimit]);
 return {id,code};
}
export async function grantAccess(db,userId,{days=30,dailyLimit=20,source='manual'}={}){
 if(!Number.isInteger(days)||days<1||days>366||!Number.isInteger(dailyLimit)||dailyLimit<0||dailyLimit>1000)throw accessError('权益参数不正确',400);
 await db.query(`INSERT INTO shixu_entitlements(user_id,source,ends_at,daily_ai_limit) VALUES($1,$2,now()+$3*interval '1 day',$4) ON CONFLICT(user_id) DO UPDATE SET source=$2,starts_at=now(),ends_at=now()+$3*interval '1 day',daily_ai_limit=$4,status='active',updated_at=now()`,[userId,source,days,dailyLimit]);
}
export async function redeemInvite(client,userId,code){
 if(typeof code!=='string'||!/^SX-[A-F0-9]{32}$/.test(code))throw accessError('邀请码无效或已失效');
 const invite=(await client.query('SELECT * FROM shixu_invites WHERE code_hash=$1 FOR UPDATE',[tokenHash(code)])).rows[0];
 if(!invite||invite.revoked||new Date(invite.expires_at).getTime()<=Date.now())throw accessError('邀请码无效或已失效');
 const redeemed=await client.query('SELECT 1 FROM shixu_invite_redemptions WHERE invite_id=$1 AND user_id=$2',[invite.id,userId]);
 if(redeemed.rows.length)return;
 if(invite.used_count>=invite.max_uses)throw accessError('邀请码无效或已失效');
 await grantAccess(client,userId,{days:invite.grant_days,dailyLimit:invite.daily_ai_limit,source:'invite'});
 await client.query('INSERT INTO shixu_invite_redemptions(invite_id,user_id) VALUES($1,$2)',[invite.id,userId]);
 await client.query('UPDATE shixu_invites SET used_count=used_count+1 WHERE id=$1',[invite.id]);
}
export async function createLinkTicket(db,userId){
 const ticket=randomBytes(32).toString('base64url');
 await db.query("INSERT INTO shixu_link_tickets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",[tokenHash(ticket),userId]);
 return {ticket,expiresIn:600};
}
