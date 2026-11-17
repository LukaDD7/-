import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,dirname,relative,extname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);const ts=require('typescript');
const output=resolve(root,process.env.SHIXU_MINI_OUT||'miniprogram');
const privateFile=resolve(root,'mini.config.local.json');let config={};try{config=JSON.parse(await readFile(privateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(config.apiBase&&!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(config.apiBase))throw new Error('apiBase must be an HTTPS origin without a trailing slash');
if(config.appId&&!/^wx[a-fA-F0-9]{16}$/.test(config.appId))throw new Error('Invalid AppID');
await mkdir(output,{recursive:true});
async function compile(source,dest){let text=await readFile(source,'utf8');if(source.endsWith('/config.ts'))text=`export const config=${JSON.stringify({apiBase:config.apiBase||'',version:'0.5.0-beta'})};`;
 const result=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2019,module:ts.ModuleKind.CommonJS,strict:true},fileName:source,reportDiagnostics:true});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw new Error(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));
 await mkdir(dirname(dest),{recursive:true});await writeFile(dest,result.outputText);
}
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=resolve(dir,entry.name),rel=relative(resolve(root,'mini-src'),full);if(entry.isDirectory())await walk(full);else if(!entry.name.endsWith('.d.ts')){const dest=resolve(output,rel.replace(/\.ts$/,'.js'));await mkdir(dirname(dest),{recursive:true});if(extname(full)==='.ts')await compile(full,dest);else if(entry.name==='project.config.json'){const data=JSON.parse(await readFile(full,'utf8'));data.appid=config.appId||'touristappid';if(config.libVersion)data.libVersion=config.libVersion;await writeFile(dest,JSON.stringify(data,null,2));}else await copyFile(full,dest);}}}
await walk(resolve(root,'mini-src'));
for(const name of ['planner','cloud-sync'])await compile(resolve(root,`lib/${name}.ts`),resolve(output,`core/${name}.js`));
await writeFile(resolve(output,'BUILD-INFO.json'),JSON.stringify({version:'0.5.0-beta',builtAt:new Date().toISOString(),sharedCore:['lib/planner.ts','lib/cloud-sync.ts'],configured:!!(config.appId&&config.apiBase)},null,2));
console.log('小程序项目已生成。'+(config.appId&&config.apiBase?'已使用本机公开配置。':'尚缺 AppID / HTTPS 地址，不能进行真实登录。'));
