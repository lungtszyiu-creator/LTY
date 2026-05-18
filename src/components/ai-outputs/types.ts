/**
 * AI 输出审核 UI 共享类型 —— 跟 prisma AiOutput model 解耦
 * （page server query 拿到 prisma row 后 map 成本类型传给 UI）
 */

export type AiOutputRow = {
  id: string;
  outputId: string | null;
  agentName: string;
  deptSlug: string;
  outputType: string;
  title: string;
  contentMarkdown: string;
  revisedDoc: string | null;
  cleanDoc: string | null;
  sourceInput: string | null;
  metadata: unknown;
  triggeredBy: string | null;
  reviewStatus: 'pending_human_review' | 'approved' | 'rejected';
  reviewedBy: { id: string; name: string | null; email: string } | null;
  reviewedAt: string | null; // ISO
  reviewNote: string | null;
  vaultPath: string | null;
  vaultCommitSha: string | null;
  vaultCommittedAt: string | null; // ISO
  tokenCostHkd: number | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export const REVIEW_STATUS_LABEL: Record<AiOutputRow['reviewStatus'], string> = {
  pending_human_review: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

export const REVIEW_STATUS_CLS: Record<AiOutputRow['reviewStatus'], string> = {
  pending_human_review: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export const OUTPUT_TYPE_LABEL: Record<string, string> = {
  contract_review: '合同审查',
  license_query: '证照/牌照答疑',
  task_triage: '任务分诊',
  weekly_report: '周报',
  compliance_consult: '合规咨询',
};
