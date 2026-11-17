// Operator CLI: no public admin endpoints and no payment processing.
import pg from 'pg';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createInvite,grantAccess} from './access.mjs';
const [action,...args]=process.argv.slice(2);const options={};for(let i=0;i<args.length;i+=2)options[args[i].replace(/^--/,'')]=args[i+1];
const db=new pg.Pool({max:1});
try{
 await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 if(action==='invite'){
  if(!options.output)throw new Error('output_required');
  const output=resolve(options.output);if(output.startsWith(resolve('.')+'/'))throw new Error('use_private_output_outside_project');
  const invite=await createInvite(db,{maxUses:Number(options.uses||1),validDays:Number(options.valid||14),grantDays:Number(options.days||30),dailyLimit:Number(options.ai||20)});
  await mkdir(dirname(output),{recursive:true,mode:0o700});await writeFile(output,JSON.stringify(invite,null,2),{mode:0o600,flag:'wx'});console.log('邀请码已保存到指定的私有文件。');
 }else if(action==='revoke-invite'){
  const r=await db.query('UPDATE shixu_invites SET revoked=true WHERE id=$1 RETURNING id',[options.id]);if(!r.rows.length)throw new Error('not_found');console.log('邀请码已撤销，已兑换的账号需单独停用。');
 }else if(['grant','suspend','resume'].includes(action)){
  const user=(await db.query('SELECT id FROM shixu_users WHERE email=$1',[String(options.email||'').trim().toLowerCase()])).rows[0];if(!user)throw new Error('not_found');
  if(action==='grant')await grantAccess(db,user.id,{days:Number(options.days||30),dailyLimit:Number(options.ai||20)});
  else await db.query('UPDATE shixu_users SET account_status=$2 WHERE id=$1',[user.id,action==='suspend'?'suspended':'active']);
  console.log('账号权益或状态已更新。');
 }else throw new Error('usage');
}catch(e){console.error('操作未完成，请检查命令参数、私有输出路径及数据库连接。');process.exitCode=1;}finally{await db.end();}
