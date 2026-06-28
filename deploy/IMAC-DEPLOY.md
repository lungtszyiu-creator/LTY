# LTY 任务池 · iMac 本地化部署笔记

**部署日期**：2026-05-27/28
**起因**：Neon Postgres compute quota 超额 → 看板登不上 → 借机迁本地 iMac

---

## 当前架构（双跑期·一周）

```
                  ☁️ Neon Launch Postgres
                       ↑           ↑
                       ↑           ↑
       ┌───────────────┘           └───────────────┐
   🌐 Vercel 看板                              🏠 iMac 看板
   lty-nu.vercel.app                          lty-imac.tail2206a1.ts.net:8443
   (旧, 兜底)                                  (主用)
```

**两边共用 Neon DB** — 数据零分叉。一周稳定后切到 iMac localhost PG + 退订 Neon。

---

## iMac 上的 LTY 完整服务清单

部署在 `/Users/lty/MC/lty-taskpool/` 用 `lty` 用户跑（其他 LTY 服务跑在 `/Users/yoyolung/LTY旭珑/_meta/`）。

| LaunchAgent | 用途 | 端口/路径 |
|---|---|---|
| `com.lty.taskpool` | Next.js 看板主进程 | :3000 (Funnel :8443) |
| `com.lty.taskpool-deploy-watcher` | 60s 拉 main 自动 build + 重启 | — |
| `com.lty.taskpool-health-watchdog` | 120s ping `/api/auth/csrf` 三连失败自动重启 | — |
| `com.lty.taskpool-cron-wallet-balance` | 每日 08:00 HKT 钱包快照 | — |
| `com.lty.taskpool-cron-wallet-monitor` | 每日 10:00 HKT 链上扫描 | — |
| `com.lty.taskpool-cron-monthly-finance` | 每月 1 号 10:00 月报 | — |
| `com.lty.finance-bridge` (老) | 财务 bridge 中枢 | :8080 (Funnel :443) |
| `com.lty.tg-bot` (老) | TG bot | — |
| `com.lty.drudge.watch` / `.daily` / `.mc-legal.watch` (老) | 维基管家 | — |
| `com.lty.vault-sync` (老) | vault 同步 | — |
| `com.lty.wallet-monitor-tx` (老) | 链上交易监控 | — |
| `com.lty.daily-fx-report` (老) | 09:00 HKT 汇率早报 | — |
| `com.lty.daily-reconciliation` (老) | 09:00 HKT 对账 | — |
| `homebrew.mxcl.postgresql@17` | 本地 PG（休眠，一周后切） | :5432 |
| `homebrew.mxcl.ollama` | 本地 LLM | — |

---

## .env.local 关键字段

```
DATABASE_URL          # 现指 Neon（双跑用）；一周后改 localhost:5432/lty_taskpool
NEXTAUTH_URL          # https://lty-imac.tail2206a1.ts.net:8443
NEXTAUTH_SECRET       # 从 Vercel 同步
GOOGLE_CLIENT_ID/SECRET
ADMIN_EMAILS          # lungtszyiu@gmail.com
CRON_SECRET           # 新生成（Vercel 上原本是空，cron 从未工作）
FINANCE_BRIDGE_URL    # http://localhost:8080（内部直连 iMac finance-bridge）
FINANCE_BRIDGE_KEY    # 826c6b5c... 跟 finance-bridge config.yaml 一致
VAULT_GITHUB_TOKEN    # ⚠️ Vercel 上 Encrypted 拉不下来，drudge.daily 暂时跑不动 git pull
```

`.env.local.localhost-pg-backup` = 切本地 PG 时用的备份（DATABASE_URL=localhost）。

---

## 关键修复记录（5/28）

| # | 问题 | 修法 |
|---|---|---|
| 1 | Neon compute quota 超额 | 升 Launch ($19/月) |
| 2 | NEXTAUTH_URL Vercel 单一 | 加 iMac URL，Google Console 加 redirect_uri 白名单 |
| 3 | 审批通过 TG 不推送 | 配 `FINANCE_BRIDGE_URL=http://localhost:8080` + KEY（Vercel 上原本就空） |
| 4 | brew python 缺 PyYAML | `pip install --break-system-packages pyyaml` |
| 5 | drudge.mc-legal.watch 找不到 _inbox | mkdir 空目录 `/Users/yoyolung/MC法务部/raw/_inbox` + symlink `/Users/lty/MC法务部` |
| 6 | CRON_SECRET 空 | `openssl rand` 生成新 secret |
| 7 | drudge.daily 缺 GitHub PAT | ⚠️ 待用户从 Vercel dashboard 复制 VAULT_GITHUB_TOKEN 完整值给我 |

---

## 一周后切本地 PG 步骤

```bash
# 1. SSH iMac
ssh LTY@lty-imac.tail2206a1.ts.net

# 2. pg_dump Neon 增量（覆盖式重 dump）
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH
NEON_URL=$(grep ^DATABASE_URL ~/MC/lty-taskpool/.env.local | cut -d'"' -f2)
pg_dump "$NEON_URL" --no-owner --no-acl --clean --if-exists \
  --exclude-schema='neon_*' -f /tmp/neon-final-dump.sql

# 3. 重导本地 PG
dropdb lty_taskpool && createdb lty_taskpool
psql -d lty_taskpool -f /tmp/neon-final-dump.sql

# 4. 切 .env.local 回 localhost
cp ~/MC/lty-taskpool/.env.local.localhost-pg-backup ~/MC/lty-taskpool/.env.local
# 别忘了重写 NEXTAUTH_URL / CRON_SECRET / FINANCE_BRIDGE_URL/KEY 三个 5/28 新加的

# 5. 重启
launchctl kickstart -k gui/$(id -u)/com.lty.taskpool

# 6. Neon dashboard → Cancel plan → 月底自动停付
```

---

## 已知 deferred 问题

1. **ETHERSCAN_API_KEY 缺** — wallet-monitor-tx / wallet-balance-snapshot 都返 500。Vercel 上原本就空，cron 没工作过。要修：yoyo 去 https://etherscan.io/myapikey 注册 free key 加到 `.env.local`。
2. **VAULT_GITHUB_TOKEN 缺** — drudge.daily git pull 失败。要修：yoyo 从 Vercel dashboard Settings → Environment Variables → VAULT_GITHUB_TOKEN 复制完整值给我。
3. **iMac SSH 密码** — 部署期间老板告诉了我密码（Lungtszyiu）。建议部署完轮换密码 → 重新 ssh-copy-id（我的 publickey 已经在 authorized_keys，密码改不影响我后续 SSH）。

---

## 公网入口

- **看板**: `https://lty-imac.tail2206a1.ts.net:8443`
- **finance-bridge**: `https://lty-imac.tail2206a1.ts.net` (Funnel :443)
- **Tailnet IP**: `100.94.233.49`
