/**
 * 月报详情 (/finance/monthly-reports/[yearMonth])
 *
 * 拉对应 markdown 文件 + react-markdown 渲染（remark-gfm 支持表格 / 任务列表 / 删除线）
 * yearMonth 必须 YYYY-MM 格式（vault-client 已校验，路由这里再防一手）
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { requireFinanceView } from '@/lib/finance-access';
import { getMonthlyReport } from '@/lib/vault-client';

export const dynamic = 'force-dynamic';

export default async function MonthlyReportDetailPage({
  params,
}: {
  params: Promise<{ yearMonth: string }>;
}) {
  await requireFinanceView();
  const { yearMonth } = await params;
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) notFound();

  const report = await getMonthlyReport(yearMonth);
  if (!report) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/finance/monthly-reports" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回月报列表
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{yearMonth} 月报</h1>
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          未找到该月报。可能 cron 还没生成（每月 1 号生成上月报告）。
          <div className="mt-1 text-xs">
            如果时间到了还没生成 → 检查 Vercel env <code className="rounded bg-white px-1">VAULT_GITHUB_TOKEN</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <Link href="/finance/monthly-reports" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回月报列表
        </Link>
        {report.htmlUrl && (
          <a
            href={report.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            ↗ 在 GitHub vault 查看原文
          </a>
        )}
      </div>

      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{report.yearMonth} 月报</h1>
        <p className="mt-1 text-xs text-slate-500">财务部 · 自动生成 · markdown 来自 lty-vault</p>
      </header>

      <article className="md-render text-slate-800">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
