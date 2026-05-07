import Link from 'next/link';
import { requireDeptEdit } from '@/lib/dept-access';
import { AssetForm } from '../../_components/AssetForm';
import { createAsset } from '../../_actions';

export const dynamic = 'force-dynamic';

export default async function NewAssetPage() {
  await requireDeptEdit('admin');
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link href="/dept/admin?tab=assets" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回行政部 · 资产
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">新增固定资产</h1>
        <p className="mt-1 text-xs text-slate-500">资产编号 FA-YYYYMM-NNN 自动分配</p>
      </div>
      <AssetForm mode="create" action={createAsset} cancelHref="/dept/admin?tab=assets" />
    </div>
  );
}
