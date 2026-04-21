import { prisma } from './db';
import {
  parseFields, parseLeaveBalanceValue, findLeaveCategoryField,
  OVERTIME_HOURS_PER_COMP_DAY,
} from './approvalFlow';
import { adjustLeaveBalance, POOL_FOR_CATEGORY } from './leaveBalance';

// When an approval instance becomes APPROVED, look at its template category
// and formJson to see if it should change the initiator's leave balances:
//
//   LEAVE    + category=年假 → deduct days from annual
//   LEAVE    + category=调休 → deduct days from comp
//   OVERTIME                → credit hours / 8 into comp
//
// Uses the instance id as the ledger's unique key so re-fires (e.g. admin
// force override after a normal approval already closed) are idempotent.
export async function applyBalanceEffects(instanceId: string): Promise<void> {
  const inst = await prisma.approvalInstance.findUnique({
    where: { id: instanceId },
    select: {
      id: true,
      status: true,
      initiatorId: true,
      formJson: true,
      fieldsSnapshot: true,
      template: { select: { category: true, name: true } },
    },
  });
  if (!inst || inst.status !== 'APPROVED') return;

  let form: Record<string, any> = {};
  try { form = JSON.parse(inst.formJson || '{}'); } catch { form = {}; }
  const fields = parseFields(inst.fieldsSnapshot || '[]');

  if (inst.template.category === 'LEAVE') {
    // Prefer the new split: select (请假类型) + leave_days. Fall back to the
    // legacy leave_balance bundle so old submissions still deduct correctly.
    const daysField = fields.find((x) => x.type === 'leave_days');
    const catField = findLeaveCategoryField(fields);

    let category = '';
    let days: number | null = null;

    if (daysField && catField) {
      category = String(form[catField.id] ?? '');
      const raw = form[daysField.id];
      days = raw == null || raw === '' ? null : Number(raw);
    } else {
      const legacy = fields.find((x) => x.type === 'leave_balance');
      if (!legacy) return;
      const lb = parseLeaveBalanceValue(form[legacy.id]);
      category = lb.category;
      days = lb.days;
    }

    const pool = POOL_FOR_CATEGORY[category];
    if (!pool) return; // 事假/病假/婚丧/产陪护 — no pool to touch
    if (days == null || !Number.isFinite(days) || days <= 0) return;

    await adjustLeaveBalance({
      userId: inst.initiatorId,
      pool,
      deltaDays: -days,
      source: 'LEAVE_APPROVED',
      note: `${category} 审批通过 · ${inst.template.name}`,
      approvalInstanceId: inst.id,
    });
    return;
  }

  if (inst.template.category === 'OVERTIME') {
    const f = fields.find((x) => x.type === 'overtime_hours');
    if (!f) return;
    const hours = Number(form[f.id]);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const days = +(hours / OVERTIME_HOURS_PER_COMP_DAY).toFixed(2);
    await adjustLeaveBalance({
      userId: inst.initiatorId,
      pool: 'COMP',
      deltaDays: days,
      source: 'OVERTIME_APPROVED',
      note: `加班审批通过 · ${hours} 小时 → ${days} 天调休 · ${inst.template.name}`,
      approvalInstanceId: inst.id,
    });
  }
}
