/**
 * 手动新建凭证 (/finance/vouchers/new)
 *
 * EDITOR 角色（老板 / 出纳）才能进。AI 出错时人工补救 + 极端情况下从零录账。
 */
import Link from 'next/link';
import { requireFinanceView } from '@/lib/finance-access';
import { CreateVoucherForm } from './CreateVoucherForm';

export const dynamic = 'force-dynamic';

export default async function NewVoucherPage() {
  // VIEWER（出纳）也能建：手动补救 AI 失效场景。创建会写 audit log。
  const access = await requireFinanceView();
  if (access.level === 'VIEWER') {
    // 出纳照常用，但 UI 提示一下"会留痕给老板审"
  }
  // 完全未授权才挡（requireFinanceView 已经处理 NONE）

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <Link href="/finance/vouchers" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回凭证列表
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">新建凭证</h1>
        <p className="mt-1 text-xs text-slate-500">
          手动录入凭证（草稿状态，老板审批后才会过账）。AI 出错或没创建时用这个补救。
          {access.level === 'VIEWER' && (
            <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">
              出纳建账：每次都留 audit log 给老板审
            </span>
          )}
        </p>
      </div>

      <CreateVoucherForm />
    </div>
  );
}
