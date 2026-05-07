/**
 * 部门页内嵌 API Key 卡片 —— 仅 SUPER_ADMIN 渲染
 *
 * 显示该部门所有 keys（按 scope prefix 筛）+ "+ 生成 key" 链接到
 * /admin/api-keys 预选 scope。老板要求"API Key 管理直接在每个相关
 * 部门里体现"，部门页一眼能看到本部门 AI 员工的 key 状态。
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';

export async function DeptApiKeysCard({
  deptName,
  scopePrefix,
  presetForGenerate,
  accent = 'amber',
}: {
  deptName: string;
  /** scope 前缀，例 "ADMIN_" / "LTY_LEGAL_" / "MC_LEGAL_" / "FINANCE_" */
  scopePrefix: string;
  /** 跳到 /admin/api-keys 时建议预选的 scope（先放 query，generate 页可读） */
  presetForGenerate?: string;
  accent?: 'amber' | 'sky' | 'purple' | 'rose';
}) {
  const keys = await prisma.apiKey.findMany({
    where: { scope: { startsWith: scopePrefix } },
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scope: true,
      active: true,
      revokedAt: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  const accentMap = {
    amber: 'border-amber-200/60 bg-amber-50/40 text-amber-900',
    sky: 'border-sky-200/60 bg-sky-50/40 text-sky-900',
    purple: 'border-purple-200/60 bg-purple-50/40 text-purple-900',
    rose: 'border-rose-200/60 bg-rose-50/40 text-rose-900',
  } as const;

  const generateHref = presetForGenerate
    ? `/admin/api-keys?preset=${encodeURIComponent(presetForGenerate)}`
    : '/admin/api-keys';

  return (
    <section className={`mt-6 rounded-xl border p-4 text-xs ${accentMap[accent]}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">🔑 {deptName} · AI 员工 API Key</h3>
        <Link
          href={generateHref}
          className="inline-flex items-center rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          + 生成新 Key
        </Link>
      </div>
      {keys.length === 0 ? (
        <p className="text-[11px] opacity-80">
          本部门还没生成过 Key。点右上角"+ 生成新 Key"给 Coze / n8n 用。
        </p>
      ) : (
        <ul className="divide-y divide-slate-200/60 overflow-hidden rounded-lg bg-white/70">
          {keys.map((k) => (
            <li key={k.id} className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-[11px]">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-800">{k.name}</div>
                <div className="font-mono text-[10px] text-slate-400">
                  {k.keyPrefix}… · {k.scope}
                </div>
              </div>
              <span className="shrink-0">
                {k.revokedAt ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700 ring-1 ring-rose-200">
                    已吊销
                  </span>
                ) : k.active ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
                    在用
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">停用</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] opacity-60">
        点"+ 生成新 Key"跳到通用 API Key 管理页（已自动预选本部门 scope group）。
      </p>
    </section>
  );
}
