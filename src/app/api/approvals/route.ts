import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { parseFlow, parseFields, findStartNode, nextNodeId, type FormFieldSpec } from '@/lib/approvalFlow';
import { startInstance, resolveRoleApprovers } from '@/lib/approvalRuntime';
import { notifyApprovalPending } from '@/lib/email';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const scope = req.nextUrl.searchParams.get('scope'); // "mine" | "pending" | "cc" | "all"
  const status = req.nextUrl.searchParams.get('status'); // optional
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  const where: any = {};
  if (status) where.status = status;

  if (scope === 'mine') {
    where.initiatorId = user.id;
  } else if (scope === 'pending') {
    // Instances still IN_PROGRESS where *I* have a pending APPROVAL step.
    where.status = 'IN_PROGRESS';
    where.steps = { some: { approverId: user.id, decision: null, kind: 'APPROVAL', superseded: false } };
  } else if (scope === 'cc') {
    where.steps = { some: { approverId: user.id, kind: 'CC' } };
  } else if (scope === 'all' && !isAdmin) {
    // Non-admins can only see their own + ones involving them.
    where.OR = [
      { initiatorId: user.id },
      { steps: { some: { approverId: user.id } } },
    ];
  } else if (scope !== 'all') {
    // Default: same as "involving me"
    where.OR = [
      { initiatorId: user.id },
      { steps: { some: { approverId: user.id } } },
    ];
  }

  const items = await prisma.approvalInstance.findMany({
    where,
    include: {
      template: { select: { id: true, name: true, icon: true, category: true } },
      initiator: { select: { id: true, name: true, email: true, image: true } },
      steps: {
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { submittedAt: 'desc' },
    take: 100,
  });

  return NextResponse.json(items);
}

const submitSchema = z.object({
  templateId: z.string().min(1),
  form: z.record(z.string(), z.any()),
  attachmentIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const data = submitSchema.parse(await req.json());

  const tpl = await prisma.approvalTemplate.findUnique({ where: { id: data.templateId } });
  if (!tpl || !tpl.active) {
    return NextResponse.json({ error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
  }

  const flow = parseFlow(tpl.flowJson);
  const fields = parseFields(tpl.fieldsJson);

  // Required-field validation
  for (const f of fields) {
    if (f.required) {
      const v = data.form[f.id];
      let empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (!empty && f.type === 'money' && v && typeof v === 'object') {
        empty = v.amount === undefined || v.amount === null || v.amount === '' || Number.isNaN(Number(v.amount));
      }
      if (!empty && f.type === 'leave_balance' && v && typeof v === 'object') {
        empty = !v.category || v.days === undefined || v.days === null || v.days === '';
      }
      if (empty) {
        return NextResponse.json({ error: 'REQUIRED_FIELD_MISSING', field: f.label }, { status: 400 });
      }
    }
  }

  // Date sanity — server-side backstop in case the client skipped it.
  // Covers both daterange (start/end pair stored as array) and OVERTIME's
  // two-datetime pattern detected by label (开始 / 结束).
  for (const f of fields) {
    const v = data.form[f.id];
    if (f.type === 'daterange' && Array.isArray(v) && v[0] && v[1]) {
      if (new Date(v[1]).getTime() < new Date(v[0]).getTime()) {
        return NextResponse.json(
          { error: 'INVALID_DATERANGE', message: `"${f.label}" 结束日期不能早于开始日期` },
          { status: 400 }
        );
      }
    }
  }
  if (tpl.category === 'OVERTIME') {
    const dts = fields.filter((x) => x.type === 'datetime');
    const startF = dts.find((x) => /开始/.test(x.label)) ?? dts[0];
    const endF   = dts.find((x) => /结束/.test(x.label)) ?? dts[1];
    if (startF && endF) {
      const s = data.form[startF.id]; const e = data.form[endF.id];
      if (s && e && new Date(e).getTime() <= new Date(s).getTime()) {
        return NextResponse.json(
          { error: 'INVALID_DATETIME_RANGE', message: '加班"结束时间"必须晚于"开始时间"' },
          { status: 400 }
        );
      }
    }
  }

  // Derive title: prefer a field flagged titleField, else template name + date.
  // money / leave_balance fields carry structured objects — summarise them to
  // a readable slug so titles like "报销申请 · 报销金额" don't show [object].
  let title = tpl.name;
  const titleField = fields.find((f) => f.titleField);
  if (titleField && data.form[titleField.id] !== undefined && data.form[titleField.id] !== null && data.form[titleField.id] !== '') {
    const v = data.form[titleField.id];
    let slug: string;
    if (Array.isArray(v)) {
      slug = v.join('、');
    } else if (v && typeof v === 'object') {
      if (titleField.type === 'money' && 'amount' in v) {
        slug = `${v.amount ?? ''} ${v.currency ?? ''}`.trim();
      } else if (titleField.type === 'leave_balance' && 'category' in v) {
        slug = `${v.category ?? ''}${v.days != null ? ` ${v.days} 天` : ''}`.trim();
      } else {
        slug = JSON.stringify(v);
      }
    } else {
      slug = String(v);
    }
    if (slug) title = `${tpl.name} · ${slug}`;
  }

  // Sanity: start node exists
  if (!findStartNode(flow)) {
    return NextResponse.json({ error: 'INVALID_FLOW' }, { status: 400 });
  }

  // Resolve role-based approvers (e.g. 发起人所在部门负责人) to concrete
  // user ids so the snapshot is self-contained.
  const { flow: resolvedFlow, warnings } = await resolveRoleApprovers(flow, user.id);

  // Hard block: the initiator must never appear as an approver on their own
  // submission. Strip the initiator from every approval node; if that leaves
  // any required node empty, refuse the submission with a clear message.
  const cleaned: typeof resolvedFlow.nodes = resolvedFlow.nodes.map((n) => {
    if (n.type !== 'approval') return n;
    const approvers = (n.data.approvers ?? []).filter((id) => id !== user.id);
    return { ...n, data: { ...n.data, approvers } };
  });
  const missingApprovers = cleaned.filter((n) => n.type === 'approval' && (n.data.approvers ?? []).length === 0);
  if (missingApprovers.length > 0) {
    return NextResponse.json({
      error: 'SELF_APPROVAL_BLOCKED',
      message: `审批节点"${missingApprovers[0].data.label ?? missingApprovers[0].id}"排除你之后没有其他审批人。请让模板管理员为该节点指定除你之外的人，或由其他同事发起。`,
    }, { status: 400 });
  }
  // Also strip initiator from CC lists — getting your own email is noise.
  const cleanedCc: typeof cleaned = cleaned.map((n) => {
    if (n.type !== 'cc') return n;
    const ccUsers = (n.data.ccUsers ?? []).filter((id) => id !== user.id);
    return { ...n, data: { ...n.data, ccUsers } };
  });
  const finalFlow = { ...resolvedFlow, nodes: cleanedCc };

  const instance = await prisma.$transaction(async (tx) => {
    const i = await tx.approvalInstance.create({
      data: {
        templateId: tpl.id,
        initiatorId: user.id,
        title,
        status: 'IN_PROGRESS',
        formJson: JSON.stringify(data.form),
        flowSnapshot: JSON.stringify(finalFlow),
        fieldsSnapshot: tpl.fieldsJson,
      },
    });
    if (data.attachmentIds?.length) {
      await tx.attachment.updateMany({
        where: {
          id: { in: data.attachmentIds },
          taskId: null, submissionId: null, rewardId: null,
          announcementId: null, reportId: null, approvalInstanceId: null,
        },
        data: { approvalInstanceId: i.id },
      });
    }
    return i;
  });

  // Fire the runtime to step past START and create first pending steps.
  const result = await startInstance(instance.id, finalFlow, data.form);

  // Notify the initial approvers so they don't have to poll.
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
        initiatorName: user.name ?? user.email ?? '',
      }).catch((e) => console.error('[approval] notify pending failed', e));
    }
  }

  return NextResponse.json({ ...instance, warnings }, { status: 201 });
}
