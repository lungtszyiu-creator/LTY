import { prisma } from './db';
import { parseFields, parseLeaveBalanceValue, OVERTIME_HOURS_PER_COMP_DAY } from './approvalFlow';
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
    const f = fields.find((x) => x.type === 'leave_balance');
    if (!f) return;
    const lb = parseLeaveBalanceValue(form[f.id]);
    const pool = POOL_FOR_CATEGORY[lb.category];
    if (!pool) return; // 事假/病假/婚丧/产陪护 — no pool to touch
    if (lb.days == null || lb.days <= 0) return;
    await adjustLeaveBalance({
      userId: inst.initiatorId,
      pool,
      deltaDays: -lb.days,
      source: 'LEAVE_APPROVED',
      note: `${lb.category} 审批通过 · ${inst.template.name}`,
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
