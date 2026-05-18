/**
 * AI 输出审核 helper（防 vault 污染 paradigm · 5/19）
 *
 * AiOutput 表存待审 AI 产出。本模块封装：
 *   - approveAiOutput(id, reviewer, note?) → 把 markdown 内容 commit 到对应
 *     部门 vault repo 的 `<前缀>/AI-审核通过/<outputType>/<date>-<slug>.md`
 *     路径，回写 AiOutput.vaultPath/CommitSha/CommittedAt 留 audit
 *   - rejectAiOutput(id, reviewer, note?) → 仅标记 rejected，不入 vault
 *
 * 调用方：dept 看板 server actions（PR B 范围）。本模块本身不做鉴权 —
 * server action 调用前要先 requireDeptEdit 校验。
 *
 * 物理隔离：dept→repo+token 跟 vault-tree route 对齐：
 *   - lty-legal → lty-vault repo (VAULT_GITHUB_TOKEN) / 前缀 raw/法务部/
 *   - mc-legal → mc-legal-vault repo (MC_VAULT_GITHUB_TOKEN) / 前缀根
 */
import { prisma } from './db';
import { logAiActivity } from './ai-log';

const OWNER = 'lungtszyiu-creator';

type DeptVaultConfig = {
  repo: string;
  /** 审批通过后 commit 到的 path 前缀，必须以 / 结尾 */
  approvedPathPrefix: string;
  token: string | undefined;
  tokenEnv: string;
};

export function deptApprovedVaultConfig(deptSlug: string): DeptVaultConfig | null {
  if (deptSlug === 'lty-legal') {
    return {
      repo: 'lty-vault',
      approvedPathPrefix: 'raw/法务部/AI-审核通过/',
      token: process.env.VAULT_GITHUB_TOKEN,
      tokenEnv: 'VAULT_GITHUB_TOKEN',
    };
  }
  if (deptSlug === 'mc-legal') {
    return {
      repo: 'mc-legal-vault',
      approvedPathPrefix: 'AI-审核通过/',
      token: process.env.MC_VAULT_GITHUB_TOKEN,
      tokenEnv: 'MC_VAULT_GITHUB_TOKEN',
    };
  }
  // 未来扩：行政/HR/财务等做"AI 审核 inbox"流时按 paradigm 加这里
  return null;
}

/** 把字符串清成 path-safe 的 ASCII slug；保留中文（GitHub 路径接受 UTF-8） */
function slugify(s: string): string {
  return s
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-') // 文件名禁用字符
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'untitled';
}

function todayYyyyMmDd(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** 拼审核通过后落到 vault 的 path */
function buildApprovedPath(cfg: DeptVaultConfig, outputType: string, title: string): string {
  const subdir = slugify(outputType);
  const slug = slugify(title);
  const date = todayYyyyMmDd();
  return `${cfg.approvedPathPrefix}${subdir}/${date}-${slug}.md`;
}

/** 拼成完整 markdown 内容（带 frontmatter + 主报告 + 合同审查 3 文本附录） */
function buildApprovedMarkdown(opts: {
  agentName: string;
  outputType: string;
  title: string;
  contentMarkdown: string;
  revisedDoc: string | null;
  cleanDoc: string | null;
  sourceInput: string | null;
  metadata: unknown;
  triggeredBy: string | null;
  reviewerName: string;
  reviewNote: string | null;
  outputId: string | null;
  createdAt: Date;
}): string {
  const frontmatter = [
    '---',
    `agent_name: ${opts.agentName}`,
    `output_type: ${opts.outputType}`,
    `title: ${JSON.stringify(opts.title)}`,
    `created_at: ${opts.createdAt.toISOString()}`,
    `approved_at: ${new Date().toISOString()}`,
    `approved_by: ${JSON.stringify(opts.reviewerName)}`,
    opts.outputId ? `output_id: ${opts.outputId}` : null,
    opts.triggeredBy ? `triggered_by: ${opts.triggeredBy}` : null,
    `created_by_ai: true`,
    `review_status: approved`,
    '---',
    '',
  ]
    .filter(Boolean)
    .join('\n');

  const parts: string[] = [frontmatter, `# ${opts.title}\n`, opts.contentMarkdown.trim()];
  if (opts.reviewNote && opts.reviewNote.trim()) {
    parts.push(`\n## 审核备注\n\n${opts.reviewNote.trim()}`);
  }
  if (opts.revisedDoc && opts.revisedDoc.trim()) {
    parts.push(`\n## 修订版\n\n${opts.revisedDoc.trim()}`);
  }
  if (opts.cleanDoc && opts.cleanDoc.trim()) {
    parts.push(`\n## 签约版\n\n${opts.cleanDoc.trim()}`);
  }
  if (opts.metadata && typeof opts.metadata === 'object') {
    parts.push(`\n## metadata\n\n\`\`\`json\n${JSON.stringify(opts.metadata, null, 2)}\n\`\`\``);
  }
  if (opts.sourceInput && opts.sourceInput.trim()) {
    parts.push(`\n## 原始输入（audit）\n\n${opts.sourceInput.trim()}`);
  }
  return parts.join('\n');
}

type CommitResult =
  | { ok: true; vaultPath: string; commitSha: string }
  | { ok: false; error: string };

/** PUT 文件到 GitHub Contents API；如果同 path 已存在，加 -1/-2 后缀重试 3 次 */
async function commitToVault(opts: {
  repo: string;
  path: string;
  contentBase64: string;
  message: string;
  token: string;
}): Promise<CommitResult> {
  let attemptPath = opts.path;
  for (let attempt = 0; attempt < 4; attempt++) {
    const encodedPath = attemptPath
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    const url = `https://api.github.com/repos/${OWNER}/${opts.repo}/contents/${encodedPath}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: opts.message, content: opts.contentBase64 }),
      });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (resp.ok) {
      const data = (await resp.json()) as { commit?: { sha?: string } };
      return { ok: true, vaultPath: attemptPath, commitSha: data.commit?.sha ?? '' };
    }
    const text = await resp.text();
    if (resp.status === 422 && text.includes('already exists')) {
      // 加序号重试
      const suffix = `-${attempt + 1}`;
      attemptPath = opts.path.replace(/(\.\w+)?$/, (ext) => `${suffix}${ext}`);
      continue;
    }
    return { ok: false, error: `GitHub ${resp.status}: ${text.slice(0, 200)}` };
  }
  return { ok: false, error: '同 path 加 -1/-2/-3 重试后仍冲突，请手动改 title 重审' };
}

export type ApproveResult =
  | {
      ok: true;
      aiOutputId: string;
      vaultPath: string;
      vaultCommitSha: string;
      vaultCommittedAt: string;
    }
  | { ok: false; error: string; aiOutputId: string };

/**
 * 审核通过：commit markdown 到 vault + 回写 AiOutput
 *
 * 鉴权 + reviewer 身份由调用方（server action）负责校验。本函数假定
 * reviewer 已通过部门权限校验。
 */
export async function approveAiOutput(opts: {
  aiOutputId: string;
  reviewerId: string;
  reviewerName: string;
  reviewNote?: string | null;
}): Promise<ApproveResult> {
  const row = await prisma.aiOutput.findUnique({
    where: { id: opts.aiOutputId },
    select: {
      id: true,
      outputId: true,
      agentName: true,
      deptSlug: true,
      outputType: true,
      title: true,
      contentMarkdown: true,
      revisedDoc: true,
      cleanDoc: true,
      sourceInput: true,
      metadata: true,
      triggeredBy: true,
      reviewStatus: true,
      createdAt: true,
      apiKeyId: true,
    },
  });
  if (!row) {
    return { ok: false, error: '记录不存在', aiOutputId: opts.aiOutputId };
  }
  if (row.reviewStatus !== 'pending_human_review') {
    return {
      ok: false,
      error: `当前状态 ${row.reviewStatus}，不能再次审批`,
      aiOutputId: opts.aiOutputId,
    };
  }

  const cfg = deptApprovedVaultConfig(row.deptSlug);
  if (!cfg) {
    return {
      ok: false,
      error: `dept=${row.deptSlug} 暂无 vault 审批配置`,
      aiOutputId: opts.aiOutputId,
    };
  }
  if (!cfg.token) {
    return {
      ok: false,
      error: `Vercel env 缺 ${cfg.tokenEnv}`,
      aiOutputId: opts.aiOutputId,
    };
  }

  // 1. 拼 markdown + base64
  const markdown = buildApprovedMarkdown({
    agentName: row.agentName,
    outputType: row.outputType,
    title: row.title,
    contentMarkdown: row.contentMarkdown,
    revisedDoc: row.revisedDoc,
    cleanDoc: row.cleanDoc,
    sourceInput: row.sourceInput,
    metadata: row.metadata,
    triggeredBy: row.triggeredBy,
    reviewerName: opts.reviewerName,
    reviewNote: opts.reviewNote ?? null,
    outputId: row.outputId,
    createdAt: row.createdAt,
  });
  const contentBase64 = Buffer.from(markdown, 'utf8').toString('base64');
  const vaultPath = buildApprovedPath(cfg, row.outputType, row.title);
  const message = `[ai-output approved] ${row.agentName} · ${row.outputType} · ${row.title.slice(0, 60)}`;

  // 2. commit
  const commitRes = await commitToVault({
    repo: cfg.repo,
    path: vaultPath,
    contentBase64,
    message,
    token: cfg.token,
  });
  if (!commitRes.ok) {
    return { ok: false, error: commitRes.error, aiOutputId: opts.aiOutputId };
  }

  // 3. 回写 AiOutput
  const now = new Date();
  await prisma.aiOutput.update({
    where: { id: row.id },
    data: {
      reviewStatus: 'approved',
      reviewedById: opts.reviewerId,
      reviewedAt: now,
      reviewNote: opts.reviewNote ?? null,
      vaultPath: commitRes.vaultPath,
      vaultCommitSha: commitRes.commitSha,
      vaultCommittedAt: now,
    },
  });

  // 4. 写一条 activity-log
  await logAiActivity({
    aiRole: 'reviewer',
    action: `ai_output_approved:${row.outputType}`,
    payload: {
      summary: `审核通过：${row.agentName} · ${row.title}（已 commit 到 ${commitRes.vaultPath}）`,
      aiOutputId: row.id,
      vaultPath: commitRes.vaultPath,
      vaultCommitSha: commitRes.commitSha,
      reviewerId: opts.reviewerId,
    },
    apiKeyId: row.apiKeyId ?? undefined,
    vaultWritten: true,
  }).catch(() => null);

  return {
    ok: true,
    aiOutputId: row.id,
    vaultPath: commitRes.vaultPath,
    vaultCommitSha: commitRes.commitSha,
    vaultCommittedAt: now.toISOString(),
  };
}

export type RejectResult =
  | { ok: true; aiOutputId: string }
  | { ok: false; error: string; aiOutputId: string };

/** 审核拒绝：仅标记 rejected + 写 reviewNote，不入 vault */
export async function rejectAiOutput(opts: {
  aiOutputId: string;
  reviewerId: string;
  reviewerName: string;
  reviewNote: string; // reject 必须给理由
}): Promise<RejectResult> {
  if (!opts.reviewNote.trim()) {
    return { ok: false, error: '拒绝必须填理由', aiOutputId: opts.aiOutputId };
  }
  const row = await prisma.aiOutput.findUnique({
    where: { id: opts.aiOutputId },
    select: { id: true, reviewStatus: true, agentName: true, title: true, outputType: true, apiKeyId: true },
  });
  if (!row) {
    return { ok: false, error: '记录不存在', aiOutputId: opts.aiOutputId };
  }
  if (row.reviewStatus !== 'pending_human_review') {
    return {
      ok: false,
      error: `当前状态 ${row.reviewStatus}，不能再次审批`,
      aiOutputId: opts.aiOutputId,
    };
  }
  await prisma.aiOutput.update({
    where: { id: row.id },
    data: {
      reviewStatus: 'rejected',
      reviewedById: opts.reviewerId,
      reviewedAt: new Date(),
      reviewNote: opts.reviewNote.trim(),
    },
  });
  await logAiActivity({
    aiRole: 'reviewer',
    action: `ai_output_rejected:${row.outputType}`,
    payload: {
      summary: `审核拒绝：${row.agentName} · ${row.title}（${opts.reviewNote.slice(0, 80)}）`,
      aiOutputId: row.id,
      reviewerId: opts.reviewerId,
      reviewNote: opts.reviewNote,
    },
    apiKeyId: row.apiKeyId ?? undefined,
  }).catch(() => null);
  return { ok: true, aiOutputId: row.id };
}
