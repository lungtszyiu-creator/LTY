#!/usr/bin/env bash
# LTY taskpool cron wrapper
# 用法: lty-taskpool-cron.sh <endpoint>
# 例: lty-taskpool-cron.sh wallet-balance-snapshot
set -u
ENDPOINT="${1:?endpoint required}"
SECRET_FILE=/Users/lty/MC/lty-taskpool/.env.local
LOG=/tmp/lty-taskpool-cron.log
URL="https://lty-imac.tail2206a1.ts.net:8443/api/cron/$ENDPOINT"

# 从 .env.local 读 CRON_SECRET
SECRET=$(grep '^CRON_SECRET=' "$SECRET_FILE" | cut -d'"' -f2)
[ -z "$SECRET" ] && { echo "[$(date '+%F %T')] $ENDPOINT: NO_SECRET" >>"$LOG"; exit 1; }

echo "[$(date '+%F %T')] $ENDPOINT START" >>"$LOG"
HTTP=$(curl -sS -o /tmp/lty-cron-$ENDPOINT.out -w '%{http_code}' \
       -H "Authorization: Bearer $SECRET" \
       -m 120 "$URL" 2>>"$LOG") || HTTP="ERR"
echo "[$(date '+%F %T')] $ENDPOINT DONE http=$HTTP body_size=$(stat -f%z /tmp/lty-cron-$ENDPOINT.out 2>/dev/null)" >>"$LOG"
