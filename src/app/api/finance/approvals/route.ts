/**
 * 财务审批请求 API（CFO AI 用）
 *
 * POST /api/finance/approvals — CFO AI 提交需老板审批的高风险财务事项
 *
 * 复用现有 ApprovalTemplate / ApprovalInstance 体系：
 *  - 首次调用时自动创建 AI 系统用户 (`ai-finance@lty.local`) 和模板 (`finance-large-payment`)
 *  - 每次调用从该模板生成 ApprovalInstance，initiator = AI 系统用户
 *  - 审批人通过 FOUNDER source 自动解析为 SUPER_ADMIN（老板）
 *  - 复用 startInstance 让审批流跑起来 + email 通知
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';
import { parseFlow } from '@/lib/approvalFlow';
import { startInstance, resolveRoleApprovers } from '@/lib/approvalRuntime';
import { notifyApprovalPending } from '@/lib/email';

const AI_FINANCE_USER_EMAIL = 'ai-finance@lty.local';
const TEMPLATE_SLUG = 'finance-large-payment';

// ---- 自动 seed：AI 系统用户 ----
async function ensureAiUser() {
  return prisma.user.upsert({
    where: { email: AI_FINANCE_USER_EMAIL },
    update: {},
    create: {
      email: AI_FINANCE_USER_EMAIL,
      name: 'AI Finance Agent',
      role: 'MEMBER',
      active: true,
    },
  });
}

// ---- 自动 seed：财务大额审批模板 ----
async function ensureTemplate(creatorId: string) {
  const existing = await prisma.approvalTemplate.findUnique({ where: { slug: TEMPLATE_SLUG } });
  if (existing) return existing;

  const flowJson = JSON.stringify({
    nodes: [
      { id: 'start', type: 'start', position: { x: 200, y: 60 }, data: { label: 'AI Initiator' } },
      {
        id: 'a1',
        type: 'approval',
        position: { x: 200, y: 220 },
        data: { label: 'Boss Approval', approvers: [], mode: 'ALL', approverSource: 'FOUNDER' },
      },
      { id: 'end', type: 'end', position: { x: 200, y: 380 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e-start-a1', source: 'start', target: 'a1' },
      { id: 'e-a1-end', source: 'a1', target: 'end' },
    ],
  });

  const fieldsJson = JSON.stringify([
    {
      id: 'type',
      type: 'select',
      label: 'Request Type',
      required: true,
      options: ['PAYMENT', 'VOUCHER_POSTING', 'REPORT', 'OTHER'],
    },
    { id: 'title', type: 'text', label: 'Title', required: true, titleField: true },
    { id: 'summary', type: 'textarea', label: 'Summary', required: true },
    {
      id: 'urgency',
      type: 'select',
      label: 'Urgency',
      required: true,
      options: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
    },
    { id: 'amount', type: 'text', label: 'Amount' },
    {
      id: 'currency',
      type: 'select',
      label: 'Currency',
      options: ['USD', 'USDT', 'USDC', 'HKD', 'CNY'],
    },
    { id: 'payloadJson', type: 'textarea', label: 'Raw Payload (JSON)' },
    { id: 'vaultPath', type: 'text', label: 'Obsidian Vault Path' },
  ]);

  return prisma.approvalTemplate.create({
    data: {
      slug: TEMPLATE_SLUG,
      name: 'Finance Approval Request',
      category: 'OTHER',
      icon: '💰',
      description: 'High-stakes finance approval submitted by AI agents (CFO).',
      active: true,
      flowJson,
      fieldsJson,
      createdById: creatorId,
    },
  });
}

const createSchema = z.object({
  type: z.enum(['PAYMENT', 'VOUCHER_POSTING', 'REPORT', 'OTHER']),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']),
  amount: z.coerce.string().optional().nullable(),
  currency: z.string().max(10).optional().nullable(),
  payloadJson: z.string().max(5000).optional().nullable(),
  vaultPath: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, ['FINANCE_AI:cfo'], 'EDIT');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parseResult = createSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parseResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
        received: body,
      },
      { status: 400 },
    );
  }
  const data = parseResult.data;

  const aiUser = await ensureAiUser();
  const tpl = await ensureTemplate(aiUser.id);
  const flow = parseFlow(tpl.flowJson);

  // 表单值（按 fieldsJson 的 id 对齐）
  const form: Record<string, string> = {
    type: data.type,
    title: data.title,
    summary: data.summary,
    urgency: data.urgency,
    amount: data.amount ?? '',
    currency: data.currency ?? '',
    payloadJson: data.payloadJson ?? '',
    vaultPath: data.vaultPath ?? '',
  };

  // 解析角色审批人（FOUNDER → SUPER_ADMIN）
  const { flow: resolvedFlow, warnings } = await resolveRoleApprovers(flow, aiUser.id);

  // 检查审批节点至少有一个有效审批人（防止系统里没有 SUPER_ADMIN 时静默通过）
  const missingApprovers = resolvedFlow.nodes.filter(
    (n) => n.type === 'approval' && (n.data.approvers ?? []).length === 0,
  );
  if (missingApprovers.length > 0) {
    return NextResponse.json(
      {
        error: 'NO_APPROVER_FOUND',
        message:
          'No active SUPER_ADMIN user found in the system. Cannot create approval request.',
      },
      { status: 500 },
    );
  }

  const title = `${data.type}: ${data.title}`;

  const instance = await prisma.approvalInstance.create({
    data: {
      templateId: tpl.id,
      initiatorId: aiUser.id,
      title,
      status: 'IN_PROGRESS',
      formJson: JSON.stringify(form),
      flowSnapshot: JSON.stringify(resolvedFlow),
      fieldsSnapshot: tpl.fieldsJson,
    },
  });

  // 跑审批运行时：从 START 推进，创建第一批 pending steps
  const result = await startInstance(instance.id, resolvedFlow, form);

  // 邮件通知初始审批人
  if (result.newStepIds.length > 0) {
    const steps = await prisma.approvalStep.findMany({
      where: { id: { in: result.newStepIds } },
      include: { approver: { select: { email: true, name: true } } },
    });
    for (const s of steps) {
      if (!s.approver?.email) continue;
      notifyApprovalPending({
        approverEmail: s.approver.email,
        approverName: s.approver.name ?? s.approver.email,
        instanceId: instance.id,
        instanceTitle: title,
        templateName: tpl.name,
        initiatorName: aiUser.name ?? AI_FINANCE_USER_EMAIL,
      }).catch((e) => console.error('[finance/approvals] notify pending failed', e));
    }
  }

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'submit_approval_request',
      apiKeyId: auth.ctx.apiKeyId,
      payload: {
        approvalInstanceId: instance.id,
        type: data.type,
        title: data.title,
        urgency: data.urgency,
        amount: data.amount,
        currency: data.currency,
      },
      vaultWritten: !!data.vaultPath,
    });
  }

  return NextResponse.json({ ...instance, warnings }, { status: 201 });
}
