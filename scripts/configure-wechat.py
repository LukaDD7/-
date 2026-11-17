#!/usr/bin/env python3
"""Store public client settings and optional private WeChat credentials locally."""
from pathlib import Path
from urllib.parse import urlparse
import getpass,json,os,re,shlex
root=Path(__file__).resolve().parent.parent
app_id=input('时序小程序 AppID（wx 开头）：').strip()
base=input('已备案的 HTTPS 后台地址（例如 https://planner.example.com）：').strip().rstrip('/')
if not re.fullmatch(r'wx[a-fA-F0-9]{16}',app_id) or not re.fullmatch(r'https://[a-zA-Z0-9.-]+(?::\d+)?',base):
 raise SystemExit('格式不正确，未保存。')
secret=getpass.getpass('AppSecret（隐藏输入；暂未取得可直接回车）：').strip()
if secret and not re.fullmatch(r'[A-Za-z0-9]{32,128}',secret):raise SystemExit('AppSecret 格式不正确，未保存。')
public=root/'mini.config.local.json'
public.write_text(json.dumps({'appId':app_id,'apiBase':base},ensure_ascii=False,indent=2)+'\n');public.chmod(0o600)
if secret:
 folder=Path.home()/'.config/shixu-planner';folder.mkdir(parents=True,exist_ok=True,mode=0o700)
 target=folder/'wechat.env';temp=folder/'wechat.env.tmp'
 fd=os.open(temp,os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as output:output.write('WECHAT_APP_ID='+shlex.quote(app_id)+'\nWECHAT_APP_SECRET='+shlex.quote(secret)+'\n')
 temp.chmod(0o600);temp.replace(target)
 print('公开配置与本机私有凭证已分别保存。密钥尚未部署到 ECS。')
else:print('已保存客户端公开配置，尚未配置 AppSecret。')
print('配置完成后告诉开发者继续联调；不要把 AppSecret 发到聊天中。')
