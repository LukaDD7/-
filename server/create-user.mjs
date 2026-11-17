import pg from 'pg';
import {createUser} from './auth.mjs';
import {readFile} from 'node:fs/promises';
const [email,name]=process.argv.slice(2);
if(!email||!name||!process.stdin.isTTY){console.error('Usage: node server/create-user.mjs EMAIL DISPLAY_NAME (interactive terminal required)');process.exit(1);}
async function readPassword(){
 process.stdout.write('登录密码（至少12位，输入不显示）：');process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolve,reject)=>{let value='';const receive=chunk=>{for(const c of chunk.toString()){if(c==='\r'||c==='\n'){process.stdin.off('data',receive);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);return;}if(c==='\u0003'){process.stdin.setRawMode(false);process.stdin.pause();reject(new Error('Canceled'));return;}if(c==='\u007f')value=value.slice(0,-1);else if(c>=' ')value+=c;}};process.stdin.on('data',receive);});
}
const db=new pg.Pool({max:1});
try{const password=await readPassword();await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));const user=await createUser(db,email,password,name);console.log('账号已创建：'+user.email);}catch(e){console.error(e.code==='23505'?'该邮箱已存在':'创建失败：请检查输入和数据库连接');process.exitCode=1;}finally{await db.end();}
