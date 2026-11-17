#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir=/var/backups/shixu
install -d -m 700 "$backup_dir"
backup_file="$backup_dir/shixu-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
/usr/bin/pg_dump --no-owner --no-acl | gzip > "$backup_file"
gzip -t "$backup_file"
printf 'Shixu database backup completed.\n'
