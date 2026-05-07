/**
 * 部门页内嵌 API Key 管理卡片
 *
 * 老板要求：API Key 必须**只能在部门界面**生成，禁止部门 LEAD/ADMIN 进
 * 总管理页 /admin/api-keys（避免跨部门越权）。
 *
 * 权限：父页面应该传 canManage=true 表示当前用户能生成（LEAD/ADMIN/SUPER_ADMIN）。
 * server component 拉本部门 keys + 包裹 DeptApiKeyGenerator (client) 提供生成 UI。
 */
import { prisma } from '@/lib/db';
import { DeptApiKeyGenerator, type ScopeChoice } from './DeptApiKeyGenerator';

export async function DeptApiKeysCard({
  deptName,
  scopePrefix,
  scopeChoices,
  canManage,
  accent = 'amber',
}: {
  deptName: string;
  /** scope 前缀，例 "ADMIN_" / "LTY_LEGAL_" / "MC_LEGAL_" / "FINANCE_" / "HR_" / "CASHIER_" */
  scopePrefix: string;
  /** 该部门可选 scope 列表 + 描述。给生成 form 的 select 用 */
  scopeChoices: ScopeChoice[];
  /** 当前用户能否管理（生成 / 吊销）。仅 LEAD/ADMIN/SUPER_ADMIN */
  canManage: boolean;
  accent?: 'amber' | 'sky' | 'purple' | 'rose';
}) {
  const keys = await prisma.apiKey.findMany({
    where: { scope: { startsWith: scopePrefix } },
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    take: 30,
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

  return (
    <section className={`mt-6 rounded-xl border p-4 text-xs ${accentMap[accent]}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">🔑 {deptName} · AI 员工 API Key</h3>
      </div>

      {canManage ? (
        <DeptApiKeyGenerator
          scopePrefix={scopePrefix}
          scopeChoices={scopeChoices}
          initialKeys={keys.map((k) => ({
            ...k,
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            expiresAt: k.expiresAt?.toISOString() ?? null,
            revokedAt: k.revokedAt?.toISOString() ?? null,
            createdAt: k.createdAt.toISOString(),
          }))}
        />
      ) : keys.length === 0 ? (
        <p className="text-[11px] opacity-80">本部门还没生成过 Key。</p>
      ) : (
        <ul className="divide-y divide-slate-200/60 overflow-hidden rounded-lg bg-white/70">
          {keys.map((k) => (
            <li key={k.id} className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-[11px]">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-800">{k.name}</div>
                <div className="font-mono text-[10px] text-slate-400">{k.keyPrefix}… · {k.scope}</div>
              </div>
              <span className="shrink-0">
                {k.revokedAt ? (
                  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700 ring-1 ring-rose-200">
                    已吊销
                  </span>
                ) : k.active ? (
                  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
                    在用
                  </span>
                ) : (
                  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">停用</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[10px] opacity-60">
        {canManage
          ? '只能生成本部门 scope · 跨部门 scope（如 FINANCE_*）后端会拒。明文 Key 仅在生成那一次显示。'
          : '👁 你是部门成员，看 Key 列表 / 不能生成。需要 Key 联系部门负责人或老板。'}
      </p>
    </section>
  );
}
