#!/usr/bin/env bash
# LTY taskpool health-watchdog · 每 120s ping localhost:3000/api/auth/csrf
# 三连失败 → 强制 kickstart 主进程
set -u
LABEL=com.lty.taskpool
LOG=/tmp/lty-taskpool-health-watchdog.log
URL=http://localhost:3000/api/health
FAIL=0

while true; do
  HTTP=$(curl -sS -o /dev/null -m 8 -w '%{http_code}' "$URL" 2>/dev/null || echo "000")
  if [ "$HTTP" = "200" ]; then
    [ $FAIL -gt 0 ] && echo "[$(date '+%F %T')] recovered http=$HTTP (after $FAIL fails)" >> "$LOG"
    FAIL=0
  else
    FAIL=$((FAIL + 1))
    echo "[$(date '+%F %T')] fail #$FAIL http=$HTTP" >> "$LOG"
    if [ $FAIL -ge 3 ]; then
      echo "[$(date '+%F %T')] 3 consecutive fails → kickstart $LABEL" >> "$LOG"
      launchctl kickstart -k "gui/$(id -u)/$LABEL" >> "$LOG" 2>&1
      FAIL=0
      sleep 30   # 重启缓冲
    fi
  fi
  sleep 120
done
