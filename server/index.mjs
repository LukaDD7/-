import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {makeServer} from './app.mjs';
const {Pool}=pg;
if(!process.env.PGPASSWORD)throw new Error('Database credentials are missing');
const db=new Pool({max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:5000});
await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
await db.query('DELETE FROM shixu_sessions WHERE expires_at<now()');
const server=await makeServer({db});server.requestTimeout=75000;server.headersTimeout=15000;
server.listen(Number(process.env.PORT||8080),process.env.HOST||'0.0.0.0',()=>console.log('Shixu cloud service ready'));
const cleanup=setInterval(()=>db.query('DELETE FROM shixu_sessions WHERE expires_at<now()').catch(()=>{}),3600000);cleanup.unref();
async function stop(){server.close(async()=>{await db.end();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
