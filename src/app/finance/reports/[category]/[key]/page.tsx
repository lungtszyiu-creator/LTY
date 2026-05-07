/**
 * 报告详情 (/finance/reports/[category]/[key])
 *
 * 5 类共用：拉对应 markdown + react-markdown 渲染（remark-gfm 表格 / 任务列表）
 * 路径校验：category 必须在 ReportCategory union；key 必须匹配该 category 的 keyRegex
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { requireFinanceView } from '@/lib/finance-access';
import {
  getVaultReport,
  isReportCategory,
  REPORT_CATEGORY_META,
} from '@/lib/vault-client';

export const dynamic = 'force-dynamic';

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ category: string; key: string }>;
}) {
  await requireFinanceView();
  const { category, key } = await params;
  if (!isReportCategory(category)) notFound();
  const meta = REPORT_CATEGORY_META[category];
  if (!meta.keyRegex.test(key)) notFound();

  const report = await getVaultReport(category, key);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/finance/reports?cat=${category}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回 {meta.label}
        </Link>
        {report?.htmlUrl && (
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {meta.label} · {key}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          财务部 · 自动生成 · markdown 来自 lty-vault repo · {meta.dir}/{key}.md
        </p>
      </header>

      {report ? (
        <article className="md-render text-slate-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown}</ReactMarkdown>
        </article>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          未找到该{meta.label}（{key}）。
          <div className="mt-1 text-xs">
            可能 cron 还没生成 / 路径不存在：<code className="rounded bg-white px-1">{meta.dir}/{key}.md</code>
          </div>
          <div className="mt-1 text-xs">
            如果时间到了还没生成 → 检查 Vercel env <code className="rounded bg-white px-1">VAULT_GITHUB_TOKEN</code>
          </div>
        </div>
      )}
    </div>
  );
}
