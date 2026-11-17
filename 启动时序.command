#!/bin/zsh
set -e
cd "$(dirname "$0")"
# Optional model credentials remain outside the repository.
if [ -n "$SHIXU_CREDENTIALS_FILE" ] && [ -f "$SHIXU_CREDENTIALS_FILE" ]; then
  source "$SHIXU_CREDENTIALS_FILE"
fi
if [ ! -d node_modules ]; then
  npm ci
fi
printf '时序正在启动。请打开 http://127.0.0.1:5173/\n'
printf '关闭本窗口或按 Control+C 可以停止服务。\n'
npm run dev -- --host 127.0.0.1 --port 5173
