import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { parseFlow, parseFields, findStartNode, nextNodeId, type FormFieldSpec } from '@/lib/approvalFlow';
import { startInstance } from '@/lib/approvalRuntime';

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
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) {
        return NextResponse.json({ error: 'REQUIRED_FIELD_MISSING', field: f.label }, { status: 400 });
      }
    }
  }

  // Derive title: prefer a field flagged titleField, else template name + date
  let title = tpl.name;
  const titleField = fields.find((f) => f.titleField);
  if (titleField && data.form[titleField.id]) {
    const v = data.form[titleField.id];
    title = `${tpl.name} · ${Array.isArray(v) ? v.join('、') : String(v)}`;
  }

  // Sanity: start node exists
  if (!findStartNode(flow)) {
    return NextResponse.json({ error: 'INVALID_FLOW' }, { status: 400 });
  }

  const instance = await prisma.$transaction(async (tx) => {
    const i = await tx.approvalInstance.create({
      data: {
        templateId: tpl.id,
        initiatorId: user.id,
        title,
        status: 'IN_PROGRESS',
        formJson: JSON.stringify(data.form),
        flowSnapshot: tpl.flowJson,
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
  await startInstance(instance.id, flow);

  return NextResponse.json(instance, { status: 201 });
}
