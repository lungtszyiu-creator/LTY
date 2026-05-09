/**
 * 上报路径健康检查卡片 — /dept/ai 顶部
 *
 * 老板 5/9 报：「我明明有在用财务总监 但是 ai 员工都显示灰色掉线状态」
 *
 * 排查发现两个时间字段差距很大：
 *   - apiKey.lastUsedAt：任何用本 key 调过看板任意接口（lib/api-auth.ts 异步
 *     touch）都会更新 → "key 在被用"
 *   - aiEmployee.lastActiveAt：只有调 /api/v1/token-usage 成功才更新
 *     → "AI 在上报 token 用量"
 *
 * 两者差 > 30 min 的话基本就是 Coze plugin 没装好 / 装了但 401 / AI 是 Agent
 * 模式没法挂 plugin → token 没上报 → 看板永远显示离线，但 AI 实际在跑。
 *
 * 本卡片做 4 档诊断（仅看 active 员工）：
 *   - healthy:        lastUsedAt 跟 lastActiveAt 都很近（<60min）且差距小
 *   - plugin-broken:  lastUsedAt 近（<60min）但 lastActiveAt 老很多（差>30min）
 *                     → 红字 + 列名字 + 「去 onboarding 检查 plugin」链接
 *   - never-reported: 有 lastUsedAt 但 lastActiveAt 永远 null
 *                     → 黄字 + 「从未上报 token」
 *   - dormant:        两者都老或都 null → 灰，不报警（AI 真的没在跑）
 *
 * 全员可见（透明文化），任何同事都能看到自己部门 AI 的 plugin 是否健康。
 */
import Link from 'next/link';

export type AiHealthRow = {
  id: string;
  name: string;
  role: string;
  deptSlug: string | null;
  paused: boolean;
  lastActiveAt: string | null;
  /** apiKey.lastUsedAt — null 表示这把 key 从未被用过 */
  lastUsedAt: string | null;
  /** 没绑 ApiKey 的员工（罕见，但要兜底） */
  hasApiKey: boolean;
};

export type Diagnosis = 'healthy' | 'plugin-broken' | 'never-reported' | 'dormant' | 'no-key';

const PLUGIN_BROKEN_DIFF_MIN = 30; // lastUsed 近但 lastActive 比它老超过这个分钟数 → plugin-broken
const RECENT_USED_MIN = 60; // lastUsed 在多少分钟内才算"近"

export function diagnose(row: {
  hasApiKey: boolean;
  lastUsedAt: string | null;
  lastActiveAt: string | null;
}): Diagnosis {
  if (!row.hasApiKey) return 'no-key';
  if (!row.lastUsedAt) return 'dormant'; // key 完全没人用过 → 沉默

  const now = Date.now();
  const usedAgoMin = (now - new Date(row.lastUsedAt).getTime()) / 60_000;

  if (!row.lastActiveAt) {
    // key 在用但从未上报 token → plugin 没装；只有 key 还"近"才报警，不然算 dormant
    return usedAgoMin < RECENT_USED_MIN ? 'never-reported' : 'dormant';
  }

  const activeAgoMin = (now - new Date(row.lastActiveAt).getTime()) / 60_000;

  if (usedAgoMin < RECENT_USED_MIN) {
    // key 最近被用过：检查 lastActive 是不是同步在更新
    if (activeAgoMin - usedAgoMin > PLUGIN_BROKEN_DIFF_MIN) return 'plugin-broken';
    if (activeAgoMin < RECENT_USED_MIN) return 'healthy';
    // lastUsed 近 + lastActive 不算特别老（差<30 min）但也不是<60min 的 healthy 区间
    return 'plugin-broken';
  }

  // 两者都老 → AI 没在跑
  return 'dormant';
}

function formatAgoMin(iso: string): string {
  const ago = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ago / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export function ReportPathHealthCard({ rows }: { rows: AiHealthRow[] }) {
  const annotated = rows.map((r) => ({ ...r, diagnosis: diagnose(r) }));
  const broken = annotated.filter((r) => r.diagnosis === 'plugin-broken');
  const neverReported = annotated.filter((r) => r.diagnosis === 'never-reported');
  const healthy = annotated.filter((r) => r.diagnosis === 'healthy');

  // 没有任何报警 + 也没有任何健康（说明所有 AI 都 dormant，看板自然安静）→ 不显示
  if (broken.length === 0 && neverReported.length === 0 && healthy.length === 0) {
    return null;
  }

  // 全部健康 → 一行绿色 OK 提示，不占空间
  if (broken.length === 0 && neverReported.length === 0) {
    return (
      <section className="mb-4 rounded-xl border border-emerald-300/60 bg-emerald-100/40 px-4 py-2.5 text-[12px] text-emerald-900">
        ✅ 上报路径健康检查 — {healthy.length} 个 AI 都在正常上报 token
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl border border-rose-300 bg-rose-100/30 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-rose-900">
          ⚠️ 上报路径健康检查 ·{' '}
          {broken.length > 0 && (
            <span>
              {broken.length} 个 plugin 可能挂了
              {neverReported.length > 0 && '，'}
            </span>
          )}
          {neverReported.length > 0 && (
            <span>{neverReported.length} 个从未上报</span>
          )}
        </h2>
        <Link
          href="/dept/ai/onboarding"
          className="shrink-0 text-[11px] text-rose-800 hover:underline"
        >
          → 去检查 plugin 配置
        </Link>
      </div>

      {broken.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] font-medium text-rose-800">
            🔴 Plugin 可能挂了（key 还在用，但 token 没上报）
          </div>
          <ul className="space-y-1.5 text-[12px]">
            {broken.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-800">{r.name}</span>
                  <span className="ml-1.5 text-[10px] text-slate-500">{r.role}</span>
                  {r.deptSlug && (
                    <span className="ml-1.5 text-[10px] text-slate-400">· {r.deptSlug}</span>
                  )}
                </div>
                <div className="shrink-0 font-mono text-[10px] text-slate-600">
                  key 用过 {r.lastUsedAt ? formatAgoMin(r.lastUsedAt) : '?'} ·
                  上报{' '}
                  <span className="text-rose-700">
                    {r.lastActiveAt ? formatAgoMin(r.lastActiveAt) : '从未'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {neverReported.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] font-medium text-amber-900">
            🟡 从未上报 token（key 在用但 plugin 没装）
          </div>
          <ul className="space-y-1.5 text-[12px]">
            {neverReported.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-800">{r.name}</span>
                  <span className="ml-1.5 text-[10px] text-slate-500">{r.role}</span>
                  {r.deptSlug && (
                    <span className="ml-1.5 text-[10px] text-slate-400">· {r.deptSlug}</span>
                  )}
                </div>
                <div className="shrink-0 font-mono text-[10px] text-slate-600">
                  key 用过 {r.lastUsedAt ? formatAgoMin(r.lastUsedAt) : '?'} ·
                  上报 <span className="text-amber-800">从未</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-2 text-[11px] text-slate-600">
        <summary className="cursor-pointer hover:text-slate-800">为什么会出现这个状态？</summary>
        <div className="mt-1.5 space-y-1 rounded bg-white px-3 py-2 text-slate-600">
          <p>
            「<strong>key 在用</strong>」= apiKey.lastUsedAt 最近更新过 — AI 调过看板某个接口（财务、token-usage 等任意 API）。
          </p>
          <p>
            「<strong>上报</strong>」= aiEmployee.lastActiveAt — 只有调 <code className="rounded bg-slate-100 px-1">/api/v1/token-usage</code> 成功才更新。
          </p>
          <p>
            两者差距 &gt; 30 分钟通常意味着：
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Coze workflow 里的 LTY_Token_Report plugin 没装 / 装错 / 401（key 重新生成后忘了重 publish 这个 plugin）</li>
            <li>AI 是 Agent (chat) 模式不是 Workflow → 大模型节点不存在 → plugin 没法挂（PR #69 有迁移指南）</li>
            <li>AI 走的是 finance_bridge / 自家脚本路径，绕开了 Coze workflow</li>
          </ul>
          <p className="mt-1.5">
            修：<Link href="/dept/ai/onboarding" className="text-violet-800 hover:underline">/dept/ai/onboarding</Link>{' '}
            找到对应 AI 的 X-Api-Key，回 Coze 重 publish plugin。
          </p>
        </div>
      </details>
    </section>
  );
}
