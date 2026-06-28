#!/usr/bin/env bash
# LTY 任务池 deploy-watcher · 每 60s 拉 main 有新 commit 自动 git pull + 重启
set -u
export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin
REPO=/Users/lty/MC/lty-taskpool
LABEL=com.lty.taskpool
LOG=/tmp/lty-taskpool-deploy.log

while true; do
  echo "[$(date +%FT%T)] heartbeat" >> "$LOG"
  cd "$REPO" 2>/dev/null || { sleep 60; continue; }
  LOCAL_SHA=$(git rev-parse HEAD 2>/dev/null)
  git fetch origin main --quiet 2>>"$LOG"
  REMOTE_SHA=$(git rev-parse origin/main 2>/dev/null)
  if [ -n "$LOCAL_SHA" ] && [ -n "$REMOTE_SHA" ] && [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
    echo "[$(date '+%F %T')] new commit detected: $LOCAL_SHA -> $REMOTE_SHA" >> "$LOG"
    git pull --ff-only origin main >> "$LOG" 2>&1
    # 装新依赖 + 重 build
    if git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA" 2>/dev/null | grep -qE 'package(-lock)?\.json|prisma/schema'; then
      npm install --silent >> "$LOG" 2>&1
    fi
    npx prisma generate >> "$LOG" 2>&1
    npx next build >> "$LOG" 2>&1
    launchctl kickstart -k "gui/$(id -u)/$LABEL" >> "$LOG" 2>&1
    echo "[$(date '+%F %T')] taskpool restarted" >> "$LOG"
  fi
  sleep 60
done
