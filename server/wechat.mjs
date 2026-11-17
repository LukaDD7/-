import {randomUUID,randomBytes} from 'node:crypto';
import {hashPassword,tokenHash,createSession} from './auth.mjs';
import {transaction,redeemInvite,accessError,getAccess} from './access.mjs';
export const wechatConfigured=env=>/^wx[a-fA-F0-9]{16}$/.test(env.WECHAT_APP_ID||'')&&!!env.WECHAT_APP_SECRET;
export async function exchangeCode(code,env){
 if(!wechatConfigured(env))throw accessError('微信登录尚未配置，请联系管理员',503);
 if(typeof code!=='string'||code.length<1||code.length>256)throw accessError('请重新获取微信登录凭证',400);
 const url=new URL('https://api.weixin.qq.com/sns/jscode2session');
 for(const [key,value] of Object.entries({appid:env.WECHAT_APP_ID,secret:env.WECHAT_APP_SECRET,js_code:code,grant_type:'authorization_code'}))url.searchParams.set(key,value);
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok||data.errcode||typeof data.openid!=='string'||!data.openid||data.openid.length>128)throw new Error('invalid_login');
  return {appId:env.WECHAT_APP_ID,openId:data.openid};
 }catch{throw accessError('微信登录暂不可用，请重新登录',502);}
}
export async function loginWeChat(db,identity,{inviteCode,linkTicket}={}){
 const passwordHash=await hashPassword(randomBytes(32).toString('base64url'));
 const userId=await transaction(db,async client=>{
  // Serialize identity creation and binding, including when the identity row is absent.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[identity.appId+':'+identity.openId]);
  const existing=(await client.query('SELECT user_id FROM shixu_wechat_identities WHERE app_id=$1 AND open_id=$2',[identity.appId,identity.openId])).rows[0];
  let target=existing?.user_id;
  if(linkTicket){
   if(typeof linkTicket!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(linkTicket))throw accessError('绑定码无效或已过期');
   const ticket=(await client.query('SELECT * FROM shixu_link_tickets WHERE token_hash=$1 FOR UPDATE',[tokenHash(linkTicket)])).rows[0];
   if(!ticket||ticket.consumed_at||new Date(ticket.expires_at).getTime()<=Date.now())throw accessError('绑定码无效或已过期');
   if(existing&&existing.user_id!==ticket.user_id)throw accessError('这个微信已关联其他账号，请联系管理员处理，不会自动合并数据',409);
   const linked=(await client.query('SELECT 1 FROM shixu_wechat_identities WHERE app_id=$1 AND user_id=$2',[identity.appId,ticket.user_id])).rows;
   if(!existing&&linked.length)throw accessError('这个账号已绑定其他微信，请联系管理员',409);
   target=ticket.user_id;
   await client.query('UPDATE shixu_link_tickets SET consumed_at=now() WHERE token_hash=$1',[tokenHash(linkTicket)]);
  }
  if(!target){
   if(!inviteCode)throw accessError('当前为邀请内测，请填写邀请码或网页账号绑定码',403,'invite_required');
   target=randomUUID();
   await client.query("INSERT INTO shixu_users(id,email,display_name,password_hash,access_mode) VALUES($1,$2,'内测用户',$3,'invited')",[target,`wx-${target}@shixu.invalid`,passwordHash]);
  }
  if(inviteCode)await redeemInvite(client,target,inviteCode);
  if(!existing)await client.query('INSERT INTO shixu_wechat_identities(app_id,open_id,user_id) VALUES($1,$2,$3)',[identity.appId,identity.openId,target]);
  const access=await getAccess(client,target);if(access.status==='blocked'||access.status==='pending')throw accessError('当前账号暂无内测资格');
  return target;
 });
 const token=await createSession(db,userId,'mini');
 const row=(await db.query('SELECT id,display_name FROM shixu_users WHERE id=$1',[userId])).rows[0];
 return {token,user:{id:row.id,displayName:row.display_name},access:await getAccess(db,userId)};
}
