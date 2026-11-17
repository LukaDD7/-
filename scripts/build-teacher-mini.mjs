import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,dirname,relative,extname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),ts=require('typescript');
const source=resolve(root,'teacher-mini-src'),output=resolve(root,process.env.TEACHER_MINI_OUT||'teacher-miniprogram');
let config={};try{config=JSON.parse(await readFile(resolve(root,'teacher-mini.config.local.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(config.appId&&!/^wx[a-fA-F0-9]{16}$/.test(config.appId))throw new Error('Invalid teacher mini AppID');
if(config.ocrUrl&&!/^https:\/\/[^\s]+$/.test(config.ocrUrl))throw new Error('OCR service must be an HTTPS URL');
if(config.subscribeTemplateId&&!/^[A-Za-z0-9_-]{20,100}$/.test(config.subscribeTemplateId))throw new Error('Invalid subscribe template ID');
await mkdir(output,{recursive:true});
async function compile(path,dest){let text=await readFile(path,'utf8');if(path===resolve(source,'config.ts'))text=`export const teacherMiniConfig=${JSON.stringify({subscribeTemplateId:config.subscribeTemplateId||'',ocrUrl:config.ocrUrl||''})};`;
 const result=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2019,module:ts.ModuleKind.CommonJS,strict:true},fileName:path,reportDiagnostics:true});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw new Error(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));
 await mkdir(dirname(dest),{recursive:true});await writeFile(dest,result.outputText);
}
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=resolve(dir,entry.name),rel=relative(source,full);if(entry.isDirectory())await walk(full);else if(!entry.name.endsWith('.d.ts')&&entry.name!=='README.md'){const dest=resolve(output,rel.replace(/\.ts$/,'.js'));await mkdir(dirname(dest),{recursive:true});if(extname(full)==='.ts')await compile(full,dest);else if(entry.name==='project.config.json'){const data=JSON.parse(await readFile(full,'utf8'));data.appid=config.appId||'touristappid';if(config.libVersion)data.libVersion=config.libVersion;await writeFile(dest,JSON.stringify(data,null,2));}else await copyFile(full,dest);}}}
await walk(source);
await compile(resolve(root,'lib/teacher.ts'),resolve(output,'core/teacher.js'));
await writeFile(resolve(output,'BUILD-INFO.json'),JSON.stringify({version:'1.0.0-local',builtAt:new Date().toISOString(),sharedCore:['lib/teacher.ts'],appIdConfigured:!!config.appId,ocrConfigured:!!config.ocrUrl,reminderBackendConfigured:false,storage:'device-only'},null,2));
console.log(`知班小程序已生成：${output}。本机资料模式；微信定时推送后台未配置。`);
