import type { Plugin } from 'vite';
import { llmResponse } from '../lib/llm-service';
/** Credentials are read at request time by the local Node process; never bundled. */
export function localAI():Plugin{return{name:'shixu-local-ai',apply:'serve',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
    if(req.url?.split('?')[0]!=='/api/plan')return next();
    try{
      const chunks:Buffer[]=[];let length=0;
      for await(const chunk of req){length+=chunk.length;if(length>12000){res.statusCode=413;res.end(JSON.stringify({error:'输入过长'}));return;}chunks.push(chunk);}
      const host=req.headers.host||'127.0.0.1:5173';
      const headers=new Headers();if(req.headers.origin)headers.set('origin',req.headers.origin);
      const request=new Request(`http://${host}/api/plan`,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks).toString()}: {})});
      const result=await llmResponse(request,process.env);
      res.statusCode=result.status;result.headers.forEach((v,k)=>res.setHeader(k,v));res.end(await result.text());
    }catch{res.statusCode=500;res.end(JSON.stringify({error:'服务暂时不可用'}));}
  });
}};}
