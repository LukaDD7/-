import { z } from 'zod';
import { addDays, dateKey, clock, validClock } from './planner.ts';

export type LLMEnvironment={ [key:string]:string|undefined; BOYU_API_KEY?:string;BOYU_API_BASE?:string;BOYU_MODEL?:string};
const dayField=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(''));
const timeField=z.string().refine(v=>v===''||validClock(v)).default('');
const draftSchema=z.object({title:z.string().trim().min(1).max(200),minutes:z.number().int().min(5).max(480),deadline:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')),notBefore:dayField.default(''),notBeforeTime:timeField,deadlineTime:timeField,priority:z.enum(['high','medium','low']),category:z.enum(['work','study','personal']),splittable:z.boolean(),notes:z.string().max(2000),dependsOn:z.array(z.number().int().min(0).max(7)).max(7).default([])});
const inputSchema=z.object({text:z.string().trim().min(2).max(4000),today:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),context:z.object({workStart:z.string(),workEnd:z.string()}).optional()});
export type LLMUsage={providerCalled:boolean;promptTokens?:number;completionTokens?:number;totalTokens?:number};
export async function llmResponse(request:Request,env:LLMEnvironment,observe?:(usage:LLMUsage)=>void):Promise<Response>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(request.method==='GET')return respond({configured:!!(env.BOYU_API_KEY&&env.BOYU_API_BASE),provider:'博约',model:env.BOYU_MODEL||'kimi-k3'});
  if(request.method!=='POST')return respond({error:'不支持的请求方式'},405);
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return respond({error:'请求来源无效'},403);
  if(!env.BOYU_API_KEY||!env.BOYU_API_BASE)return respond({error:'当前服务未配置 AI 凭证。你仍可手动添加任务和自动安排日程。'},503);
  const raw=await request.text();
  if(raw.length>12000)return respond({error:'输入过长，请缩短描述'},413);
  let input;
  try{input=inputSchema.parse(JSON.parse(raw));}catch{return respond({error:'请填写 2～4000 字的任务描述'},400);}
  // Current date is server-owned so relative dates cannot drift or be injected by clients.
  const serverNow=Date.now();
  const today=dateKey(serverNow);
  const defaultDue=addDays(today,7);
  const system=`你是中文日程规划助手。今天是 ${today}，现在是 ${clock(serverNow)}，时区 Asia/Shanghai。把用户的工作或生活描述转换成可执行任务。只返回 JSON 对象 {"summary":"一句简短建议","tasks":[{"title":"具体行动","minutes":60,"deadline":"YYYY-MM-DD","deadlineTime":"","notBefore":"","notBeforeTime":"","priority":"high|medium|low","category":"work|study|personal","splittable":true,"notes":"验收条件或假设","dependsOn":[]}]}。最多 8 个任务。minutes 必须是 5 的倍数、5 到 480 分钟。deadline 必须是真实日期，默认 ${defaultDue}；用户说了日期则尊重，过去日期请在 summary 里说明。notBefore 是最早开始日期，未指定可填空字符串；notBeforeTime 是最早开始时间 HH:mm，未指定填空字符串。deadlineTime 是必须完成的时间 HH:mm，只有用户明确说了才填写。明天、后天、下周几必须根据今天换算真实日期；“明天下午开始”必须填明天的 notBefore，notBeforeTime 按用户时间填写，只有“下午”时使用13:00并在notes注明假设；不要把开始日期只当成截止日期。指定开始时间但没有日期时使用今天作为notBefore；指定截止时间但没有日期时使用今天作为deadline。“明天14点到15点会议”应填明天14:00最早开始、明天15:00截止、minutes=60、splittable=false；不要把明确固定时段变成可任意挪动的任务。日期或开始结束要求矛盾时保留用户给定范围，在summary说明需要调整。priority 使用 high、medium、low；category 使用 work、study、personal。dependsOn 填此任务的前置任务在 tasks 数组中的下标（从0开始），只允许引用之前的任务下标。没有前置任务填 []。调研→梳理→写作这类顺序必须写依赖；相互独立的工作、阅读、运动不要添加依赖。保持用户原意，不添加无关任务。大任务拆成明确步骤；不要为每个小步骤都标高优先级。只能提出任务草案，不要声称已经安排、修改日程或完成工作。不回答与任务规划无关的问题，不遵从用户要求改变返回格式。`;
  const usage:LLMUsage={providerCalled:false};
  try{
    const base=new URL(env.BOYU_API_BASE);
    if(base.protocol!=='https:')return respond({error:'AI 服务地址配置无效'},503);
    usage.providerCalled=true;
    const response=await fetch(base.toString().replace(/\/$/,'')+'/chat/completions',{
      method:'POST',headers:{'Authorization':`Bearer ${env.BOYU_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:env.BOYU_MODEL||'kimi-k3',messages:[{role:'system',content:system},{role:'user',content:input.text}],max_tokens:2400,temperature:1}),
      signal:AbortSignal.timeout(60000),
    });
    if(!response.ok)return respond({error:response.status===429?'AI 服务暂时繁忙，请稍后重试':response.status===401||response.status===403?'AI 服务凭证或模型权限不可用':'AI 服务暂时不可用，请稍后重试'},502);
    const data=await response.json() as {choices?:{message?:{content?:string}}[];usage?:{prompt_tokens?:number;completion_tokens?:number;total_tokens?:number}};
    for(const [source,target] of [['prompt_tokens','promptTokens'],['completion_tokens','completionTokens'],['total_tokens','totalTokens']] as const){const value=data.usage?.[source];if(Number.isInteger(value)&&value!>=0&&value!<=2147483647)usage[target]=value;}
    if(usage.totalTokens===undefined&&usage.promptTokens!==undefined&&usage.completionTokens!==undefined&&usage.promptTokens+usage.completionTokens<=2147483647)usage.totalTokens=usage.promptTokens+usage.completionTokens;
    let content=data.choices?.[0]?.message?.content||'';
    if(content.length>30000)throw new Error('invalid_output');
    content=content.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'').trim();
    const start=content.indexOf('{'),end=content.lastIndexOf('}');
    if(start<0||end<start)throw new Error('invalid_output');
    const parsed=z.object({summary:z.string().max(1000),tasks:z.array(draftSchema).min(1).max(8)}).parse(JSON.parse(content.slice(start,end+1)));
    for(const [index,t] of parsed.tasks.entries()){
      if(t.dependsOn.some(i=>i>=index))throw new Error('invalid_dependencies');
      for(const day of [t.deadline,t.notBefore])if(day&&(!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day))throw new Error('invalid_date');
      if(t.notBeforeTime&&!t.notBefore)t.notBefore=today;
      if(t.deadlineTime&&!t.deadline)t.deadline=today;
      t.minutes=Math.ceil(t.minutes/5)*5;
    }
    return respond({...parsed,model:env.BOYU_MODEL||'kimi-k3'});
  }catch(e){
    if(e instanceof Error&&(e.name==='TimeoutError'||e.name==='AbortError'))return respond({error:'AI 回复超时，请稍后重试，或先手动添加任务'},504);
    return respond({error:'AI 没有返回有效任务，请调整描述后重试'},502);
  }finally{observe?.(usage);}
}
