#!/usr/bin/env python3
"""Private browser access to Shixu's ECS backend; no model/account secrets needed."""
from pathlib import Path
import argparse,json,os,socket,stat,subprocess,sys,time,urllib.request,webbrowser
BASE=Path.home()/'.config/shixu-planner'
CONTROL=BASE/'tunnel.sock'
URL='http://127.0.0.1:8080'
CONFIG=Path(__file__).resolve().parent.parent/'cloud-tunnel.config.local.json'
try:
 LOCAL_CONFIG=json.loads(CONFIG.read_text())
except FileNotFoundError:
 LOCAL_CONFIG={}
DEST=os.environ.get('SHIXU_SSH_DEST') or LOCAL_CONFIG.get('destination','')
KEY=Path.home()/'.ssh/shixu-ecs-ed25519'
HOSTS=BASE/'ecs_known_hosts'

def ssh_args():
 return ['/usr/bin/ssh','-F','/dev/null','-i',str(KEY),'-S',str(CONTROL),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',f'UserKnownHostsFile={HOSTS}','-o','GlobalKnownHostsFile=/dev/null','-o','HostKeyAlgorithms=ssh-ed25519','-o','ConnectTimeout=15']

def active():
 return subprocess.run(ssh_args()+['-O','check',DEST],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0

def port_free():
 try:
  with socket.socket() as listener:
   listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
   listener.bind(('127.0.0.1',8080))
  return True
 except OSError:return False

def check_service():
 try:
  with urllib.request.urlopen(URL+'/api/runtime',timeout=4) as r:runtime=json.load(r)
  with urllib.request.urlopen(URL+'/api/health',timeout=4) as r:health=json.load(r)
  return runtime.get('mode')=='cloud' and health.get('status')=='ok'
 except (OSError,ValueError):return False

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--no-browser',action='store_true');parser.add_argument('--stop',action='store_true');options=parser.parse_args()
 if not DEST:
  print('请先设置 SHIXU_SSH_DEST 或 cloud-tunnel.config.local.json 中的 destination。');return 1
 BASE.mkdir(mode=0o700,exist_ok=True)
 if options.stop:
  if active():
   r=subprocess.run(ssh_args()+['-O','exit',DEST],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   if r.returncode:print('连接暂未关闭，请稍后重试。');return 1
   for attempt in range(30):
    if not active() and port_free():break
    time.sleep(.1)
  print('本机云端连接已关闭。服务器上的日程和后台仍正常保存、运行。');return 0
 if not KEY.is_file() or not HOSTS.is_file():print('缺少本机连接配置，请联系开发者完成配置。');return 1
 if not active():
  for attempt in range(20):
   if port_free():break
   time.sleep(.1)
  if not port_free():print('本机 8080 端口已被其他应用使用，请关闭占用它的应用后重试。');return 1
  if CONTROL.exists() and stat.S_ISSOCK(CONTROL.lstat().st_mode):CONTROL.unlink()
  log=BASE/'tunnel.log'
  fd=os.open(log,os.O_WRONLY|os.O_APPEND|os.O_CREAT,0o600)
  with os.fdopen(fd,'a') as output:
   r=subprocess.run(ssh_args()+['-fNT','-M','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3','-L','127.0.0.1:8080:127.0.0.1:8080',DEST],stdout=subprocess.DEVNULL,stderr=output)
  if r.returncode:print('未能连接云端，请确认网络可用后重试。连接日志位于本机专用配置目录。');return 1
 for attempt in range(5):
  if check_service():
   print('云端版已连接：'+URL+'/')
   print('任务保存在 ECS。登录信息见本机的“云端试用账号.txt”。')
   print('使用完毕可双击“关闭云端连接.command”。')
   if not options.no_browser:webbrowser.open(URL+'/')
   return 0
  time.sleep(1)
 print('连接已建立，但后台暂未响应。请稍后重新启动。');return 1

if __name__=='__main__':sys.exit(main())
