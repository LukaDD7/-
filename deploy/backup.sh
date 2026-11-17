#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
backup_dir="${SHIXU_BACKUP_DIR:-/var/backups/shixu}"
install -d -m 700 "$backup_dir"
backup_file="$backup_dir/shixu-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
umask 077
docker compose -f compose.yaml exec -T db pg_dump -U shixu -d shixu --no-owner | gzip > "$backup_file"
printf '数据库备份已写入 %s\n' "$backup_file"
