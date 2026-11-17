#!/bin/zsh
cd "$(dirname "$0")"
python3 scripts/cloud-tunnel.py --stop
read -k 1 '?按任意键关闭本窗口。'
