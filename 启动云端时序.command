#!/bin/zsh
cd "$(dirname "$0")"
if ! python3 scripts/cloud-tunnel.py; then
  printf '\n启动失败。请保留上方提示。\n'
fi
read -k 1 '?按任意键关闭本窗口（云端连接会保持）。'
