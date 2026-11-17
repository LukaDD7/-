#!/bin/zsh
cd "$(dirname "$0")"
python3 scripts/configure-wechat.py
read -k 1 '?按任意键关闭。'
