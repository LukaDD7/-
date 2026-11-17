import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {createUser} from '../server/auth.mjs';
const payload=process.argv.includes('--database')?JSON.parse(await new Promise((resolve,reject)=>{let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>resolve(text));process.stdin.on('error',reject);})):JSON.parse(await readFile('/etc/shixu/bootstrap.json','utf8'));
const database={PGHOST:'127.0.0.1',PGPORT:'5433',PGUSER:'shixu',PGDATABASE:'shixu',PGPASSWORD:payload.databasePassword};
if(!/^[a-f0-9]{64}$/.test(database.PGPASSWORD))throw new Error('Invalid bootstrap password format');
try{
 if(process.argv.includes('--database')){
  const pool=new pg.Pool({host:'/var/run/postgresql',port:5433,user:'postgres',database:'postgres',max:1});
  const role=(await pool.query("SELECT 1 FROM pg_roles WHERE rolname='shixu'")).rows;
  if(!role.length)await pool.query(`CREATE ROLE shixu LOGIN PASSWORD '${database.PGPASSWORD}'`);
  const exists=(await pool.query("SELECT 1 FROM pg_database WHERE datname='shixu'")).rows;
  if(!exists.length)await pool.query('CREATE DATABASE shixu OWNER shixu');
  await pool.end();
 }else{
  const app={...database,APP_ORIGIN:'http://127.0.0.1:8080',HOST:'127.0.0.1',PORT:'8080',BOYU_API_BASE:payload.base,BOYU_API_KEY:payload.key,BOYU_MODEL:payload.model||'kimi-k3'};
  const envText=entries=>Object.entries(entries).map(([k,v])=>{if(typeof v!=='string'||/[\r\n\0]/.test(v))throw new Error('Invalid configuration value');return `${k}=${JSON.stringify(v)}`;}).join('\n')+'\n';
  await writeFile('/etc/shixu/app.env',envText(app),{mode:0o600});
  await writeFile('/etc/shixu/database.env',envText(database),{mode:0o600});
  const result=spawnSync('runuser',['-u','postgres','--','/usr/bin/node','/opt/shixu/deploy/provision-native.mjs','--database'],{input:JSON.stringify(payload),encoding:'utf8'});
  if(result.status!==0)throw new Error('Database provisioning failed');
  const db=new pg.Pool({host:database.PGHOST,port:5433,user:database.PGUSER,database:database.PGDATABASE,password:database.PGPASSWORD,max:1});
  await db.query(await readFile('/opt/shixu/server/schema.sql','utf8'));
  const user=(await db.query('SELECT id FROM shixu_users WHERE email=$1',[payload.owner.email])).rows;
  if(!user.length)await createUser(db,payload.owner.email,payload.owner.password,payload.owner.name);
  await db.end();console.log('Database, cloud credentials and initial account configured.');
 }
}catch(error){console.error('Provision failed; check database and configuration. Code: '+(error.code||'unknown'));process.exitCode=1;}
