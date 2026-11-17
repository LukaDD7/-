import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {hashPassword,verifyPassword,normalizeEmail,authenticatedUser,createSession,sessionToken,tokenHash} from './auth.mjs';
import {getPlan,savePlan} from './store.mjs';
import {beginUsage,finishUsage,getUsage} from './usage.mjs';
import {getAccess,reserveAI,createLinkTicket,transaction,redeemInvite} from './access.mjs';
import {exchangeCode,loginWeChat,wechatConfigured} from './wechat.mjs';
import {llmResponse} from '../lib/llm-service.ts';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
export async function makeServer({db,env=process.env,staticRoot=resolve('dist-local'),invokeLLM=llmResponse,exchangeWechat=exchangeCode}){
 const origin=env.APP_ORIGIN||'http://127.0.0.1:8080';
 const originURL=new URL(origin);
 if(originURL.origin!==origin)throw new Error('APP_ORIGIN must be an origin without a trailing slash');
 if(originURL.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(originURL.hostname))throw new Error('Public APP_ORIGIN must use HTTPS');
 const secure=originURL.protocol==='https:';
 const cookie=(token,clear=false)=>`shixu_session=${clear?'':token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:7*86400}${secure?'; Secure':''}`;
 const dummyHash=await hashPassword('invalid-account-placeholder');
 const rates=new Map();let inFlight=0;
 function take(key,limit,window=60000){
  const now=Date.now();
  if(rates.size>2000)for(const [k,v] of rates)if(v.until<now)rates.delete(k);
  const current=rates.get(key);const slot=current&&current.until>now?current:{count:0,until:now+window};
  slot.count++;rates.set(key,slot);return slot.count<=limit;
 }
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
 async function body(req){
  if(!req.headers['content-type']?.startsWith('application/json')){const e=new Error('请求格式不正确');e.status=415;throw e;}
  let length=0;const pieces=[];for await(const part of req){length+=part.length;if(length>1024*1024){const e=new Error('输入过长');e.status=413;throw e;}pieces.push(part);}
  try{const parsed=JSON.parse(Buffer.concat(pieces).toString());if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('invalid_body');return parsed;}catch{const e=new Error('请求格式不正确');e.status=400;throw e;}
 }
 return createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  try{
   const path=new URL(req.url,origin).pathname;
   if(path.startsWith('/api/')){
    if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'请求来源无效'});
    if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'请求来源无效'});
    if(path==='/api/runtime'&&req.method==='GET')return json(res,200,{mode:'cloud',requiresLogin:true,wechatConfigured:wechatConfigured(env),registration:'invite-only'});
    if(path==='/api/health'&&req.method==='GET'){await db.query('SELECT 1');return json(res,200,{status:'ok'});}
    if(path==='/api/auth/login'&&req.method==='POST'){
     const data=await body(req),email=normalizeEmail(data.email),password=data.password;
     if(!take(`login:${req.socket.remoteAddress}`,30,10*60000)||!take(`account:${email}`,8,10*60000))return json(res,429,{error:'登录尝试过多，请稍后重试'});
     if(!email||email.length>254||typeof password!=='string'||password.length>256)return json(res,400,{error:'请填写邮箱和密码'});
     const {rows}=await db.query('SELECT id,password_hash FROM shixu_users WHERE email=$1',[email]);
     const good=await verifyPassword(password,rows[0]?.password_hash||dummyHash);
     if(!rows[0]||!good)return json(res,401,{error:'邮箱或密码不正确'});
     const token=await createSession(db,rows[0].id);res.setHeader('Set-Cookie',cookie(token));return json(res,200,{ok:true});
    }
    if(path==='/api/auth/wechat'&&req.method==='POST'){
     if(!wechatConfigured(env))return json(res,503,{error:'微信登录尚未配置，请联系管理员'});
     if(!take(`wechat:${req.socket.remoteAddress}`,30,10*60000))return json(res,429,{error:'登录过于频繁，请稍后重试'});
     const data=await body(req);
     if(typeof data.code!=='string'||!data.code||data.code.length>256)return json(res,400,{error:'请重新获取微信登录凭证'});
     const identity=await exchangeWechat(data.code,env);
     return json(res,200,await loginWeChat(db,identity,{inviteCode:typeof data.inviteCode==='string'?data.inviteCode.trim().toUpperCase():undefined,linkTicket:data.linkTicket}));
    }
    const user=await authenticatedUser(db,req);
    if(!user)return json(res,401,{error:'请先登录'});
    if(path==='/api/auth/me'&&req.method==='GET')return json(res,200,{user,access:await getAccess(db,user.id)});
    if(path==='/api/auth/logout'&&req.method==='POST'){const token=sessionToken(req);if(token)await db.query('DELETE FROM shixu_sessions WHERE token_hash=$1',[tokenHash(token)]);res.setHeader('Set-Cookie',cookie('',true));return json(res,200,{ok:true});}
    const access=await getAccess(db,user.id);
    if(path==='/api/access'&&req.method==='GET')return json(res,200,access);
    if(!access.canExport)return json(res,403,{error:'当前账号暂无访问资格，请联系管理员',code:'access_denied'});
    if(path==='/api/access/redeem'&&req.method==='POST'){
     if(!take(`redeem:${user.id}`,10,10*60000))return json(res,429,{error:'尝试过于频繁，请稍后重试'});
     const data=await body(req);await transaction(db,client=>redeemInvite(client,user.id,typeof data.inviteCode==='string'?data.inviteCode.trim().toUpperCase():''));
     return json(res,200,await getAccess(db,user.id));
    }
    if(path==='/api/auth/link-ticket'&&req.method==='POST'){
     if(user.clientType!=='web'||!access.canUse)return json(res,403,{error:'请登录已有网页账号后生成绑定码'});
     if(!wechatConfigured(env))return json(res,503,{error:'微信登录尚未配置，暂不生成绑定码'});
     if(!take(`link:${user.id}`,5,10*60000))return json(res,429,{error:'绑定码生成过于频繁，请稍后重试'});
     return json(res,200,await createLinkTicket(db,user.id));
    }
    if(!access.canUse&&!(req.method==='GET'&&['/api/state','/api/usage'].includes(path)))return json(res,403,{error:'内测权益已到期，可导出数据；继续使用请联系管理员',code:'entitlement_expired'});
    if(path==='/api/usage'&&req.method==='GET')return json(res,200,await getUsage(db,user.id));
    if(path==='/api/state'&&req.method==='GET')return json(res,200,await getPlan(db,user.id));
    if(path==='/api/state'&&req.method==='PUT'){
     if(!take(`save:${user.id}`,120))return json(res,429,{error:'保存过于频繁，请稍后重试'});
     const data=await body(req);const saved=await savePlan(db,user.id,data.revision,data.state);return json(res,saved.status,saved);
    }
    if(path==='/api/plan'&&(req.method==='GET'||req.method==='POST')){
     if(req.method==='GET'){
      const result=await invokeLLM(new Request(origin+path),env);res.statusCode=result.status;result.headers.forEach((v,k)=>res.setHeader(k,v));res.end(await result.text());return;
     }
     if(!take(`ai:${user.id}`,10))return json(res,429,{error:'AI 请求过于频繁，请稍后重试'});
     const data=await body(req);if(JSON.stringify(data).length>12000)return json(res,413,{error:'任务描述过长'});
     if(typeof data.text!=='string'||data.text.trim().length<2||data.text.length>4000)return json(res,400,{error:'请填写 2～4000 字的任务描述'});
     if(inFlight>=2)return json(res,429,{error:'AI 正在处理其他请求，请稍后重试'});
     inFlight++;
     let usageId=null,status=500,usage;const started=Date.now();
     try{
      if(!await reserveAI(db,user.id))return json(res,429,{error:'今日 AI 额度已用完，请明天再试',code:'quota_exhausted'});
      usageId=await beginUsage(db,user.id,env.BOYU_MODEL||'kimi-k3');
      const request=new Request(origin+path,{method:'POST',headers:req.headers.origin?{origin:req.headers.origin}:{},body:JSON.stringify(data)});
      const result=await invokeLLM(request,env,event=>{usage=event;});status=result.status;const text=await result.text();res.statusCode=result.status;result.headers.forEach((v,k)=>res.setHeader(k,v));res.end(text);
     }finally{inFlight--;if(usageId)try{await finishUsage(db,usageId,status,Date.now()-started,usage);}catch{console.error('AI usage finalization unavailable; pending record retained');}}
     return;
    }
    return json(res,404,{error:'接口不存在'});
   }
   if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'不支持的请求方式'});
   let file=resolve(staticRoot,'.'+decodeURIComponent(path));
   if(!file.startsWith(staticRoot+sep)&&file!==staticRoot)return json(res,404,{error:'文件不存在'});
   if(path==='/')file=resolve(staticRoot,'index.html');
   let metadata;try{metadata=await stat(file);}catch{return json(res,404,{error:'文件不存在'});}
   if(!metadata.isFile())return json(res,404,{error:'文件不存在'});
   let content=await readFile(file);if(extname(file)==='.html')content=Buffer.from(content.toString().replace('</head>','<meta name="shixu-runtime" content="cloud"></head>'));
   res.writeHead(200,{'Content-Type':MIME[extname(file)]||'application/octet-stream','Cache-Control':path.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache'});
   res.end(req.method==='HEAD'?undefined:content);
  }catch(e){json(res,e.status||500,{error:e.status?e.message:'服务暂时不可用，请稍后重试',...(e.status&&e.code?{code:e.code}:{})});}
 });
}
