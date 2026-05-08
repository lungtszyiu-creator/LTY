/**
 * AI 工作日记 section — 今日 AiActivityLog 按员工分组展示
 *
 * 老板要"看到 AI 员工每天工作都做了什么"。这一段把今日的 AiActivityLog 按
 * 员工分组列出来：每个 AI 一张卡，里面时间线，每行一个动作（创建凭证 /
 * 记录链上交易 / 推送 TG 等）。
 *
 * 数据源：AiActivityLog 表（看板每次 AI 调写 endpoint 都自动记一行）。
 * 关联：apiKey → aiEmployee → name/role（让卡片标题用真名而非 aiRole 字符串）
 *
 * 全员可见（在 /dept/ai 透明文化页内）。
 */
import Link from 'next/link';

export type ActivityRow = {
  id: string;
  aiRole: string;
  action: string;
  status: string;
  payload: string | null;
  voucherId: string | null;
  chainTransactionId: string | null;
  fxRateId: string | null;
  reconciliationId: string | null;
  telegramSent: boolean;
  vaultWritten: boolean;
  createdAt: string; // ISO
  employeeName: string | null;
  employeeRole: string | null;
  apiKeyName: string | null;
};

/** action 字符串 → 中文友好标签 */
const ACTION_LABEL: Record<string, string> = {
  create_voucher: '📒 创建凭证',
  update_voucher: '📒 修改凭证',
  log_chain_tx: '🪙 记录链上交易',
  update_fx_rate: '📈 更新汇率',
  create_reconciliation: '🔄 创建对账',
  approve_voucher: '✅ 审批凭证',
  reject_voucher: '❌ 驳回凭证',
  send_to_telegram: '📱 推送 TG',
  archive_to_obsidian: '📦 归档 vault',
  // Token 监控相关
  budget_exceeded_auto_pause: '⏸ 撞顶自动暂停',
  unpause_employee: '🔓 解锁员工',
  company_budget_exceeded: '⚠️ 公司预算超支',
  // 系统操作
  regenerate_api_key: '🔄 重生成 API Key',
  vault_etl_run: '📥 vault 数据 ETL',
  vault_etl_dryrun: '🧪 vault ETL Dry-run',
  import_employee_from_key: '👤 导入 AI 员工档案',
};

type EmployeeGroup = {
  key: string;
  name: string;
  role: string | null;
  count: number;
  activities: ActivityRow[];
};

function groupByEmployee(rows: ActivityRow[]): EmployeeGroup[] {
  const groups = new Map<string, EmployeeGroup>();
  for (const r of rows) {
    // 优先按 employeeName 分组；没员工档案的（system / ai_employee 等）按 aiRole
    const key = r.employeeName ?? r.aiRole ?? 'unknown';
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: r.employeeName ?? roleLabel(r.aiRole),
        role: r.employeeRole,
        count: 0,
        activities: [],
      };
      groups.set(key, g);
    }
    g.count++;
    g.activities.push(r);
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

function roleLabel(aiRole: string): string {
  if (aiRole === 'system') return '🤖 系统';
  if (aiRole === 'ai_employee') return '🤖 AI 员工（未识别）';
  return aiRole;
}

export function AiActivityFeed({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          今日 AI 工作日记
        </h2>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-6 text-center text-sm text-slate-500">
          📓 今日还没有 AI 活动记录。让 AI 跑业务（调看板写凭证 / 链上交易 / 汇率 / 推送 TG 等）就会出现在这里。
        </div>
      </section>
    );
  }

  const groups = groupByEmployee(rows);

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          今日 AI 工作日记
        </h2>
        <span className="text-[11px] text-slate-400">
          {rows.length} 条活动 · 按员工分组
        </span>
      </div>

      <ul className="space-y-3">
        {groups.map((g) => (
          <li
            key={g.key}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            {/* 员工头部 */}
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50/40 px-4 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-slate-800">{g.name}</span>
                {g.role && <span className="text-xs text-slate-500">{g.role}</span>}
              </div>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800 ring-1 ring-violet-300">
                {g.count} 次
              </span>
            </div>

            {/* 活动时间线 */}
            <ul className="divide-y divide-slate-100">
              {g.activities.slice(0, 15).map((a) => (
                <ActivityRowItem key={a.id} a={a} />
              ))}
              {g.activities.length > 15 && (
                <li className="px-4 py-1.5 text-center text-[11px] text-slate-400">
                  … 还有 {g.activities.length - 15} 条
                </li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityRowItem({ a }: { a: ActivityRow }) {
  const time = new Date(a.createdAt).toLocaleTimeString('zh-HK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const label = ACTION_LABEL[a.action] ?? a.action;
  const isFailed = a.status === 'failed';

  // 业务关联链接（点开看具体那条记录）
  const link = (() => {
    if (a.voucherId) return { href: `/finance?voucher=${a.voucherId}`, label: '凭证' };
    if (a.chainTransactionId) return { href: `/finance`, label: '链上交易' };
    if (a.fxRateId) return { href: `/finance/fx-rates`, label: '汇率' };
    if (a.reconciliationId) return { href: `/finance`, label: '对账' };
    return null;
  })();

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-sm">
      <time className="shrink-0 font-mono text-xs text-slate-400 tabular-nums">{time}</time>
      <span
        className={`flex-1 ${isFailed ? 'text-rose-700' : 'text-slate-700'}`}
      >
        {label}
        {isFailed && <span className="ml-1 text-[10px] text-rose-600">（失败）</span>}
      </span>
      {/* 三向分发标记 */}
      <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
        {a.telegramSent && (
          <span title="已推 TG" className="text-sky-600">📱</span>
        )}
        {a.vaultWritten && (
          <span title="已归档 vault" className="text-emerald-600">📦</span>
        )}
        {link && (
          <Link
            href={link.href}
            className="text-violet-700 hover:underline"
            title={`查看${link.label}`}
          >
            🔗 {link.label}
          </Link>
        )}
      </div>
    </li>
  );
}
