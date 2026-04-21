import { prisma } from './db';
import {
  parseFlow, nextNodeId, findStartNode, findNodeById, evaluateCondition,
  type FlowGraph, type FlowNode,
} from './approvalFlow';

// Resolve role-based approvers on all approval nodes to concrete user ids.
// Returns a new flow object; the caller uses this as the snapshot saved on
// the instance so later reviews see the resolved names even if memberships
// change afterwards.
//
// Integrity rules baked in here (the "monitor-the-monitors" guard):
//  1. FOUNDER source → all active SUPER_ADMINs.
//  2. If the initiator is a "management tier" user (global ADMIN/SUPER_ADMIN,
//     or a department LEAD/ADMIN), INITIATOR_DEPT_LEAD nodes get rerouted to
//     SUPER_ADMIN automatically. Prevents a finance admin from approving
//     their own reimbursement by having their lead be themselves or a peer
//     who might rubber-stamp it.
export async function resolveRoleApprovers(
  flow: FlowGraph,
  initiatorId: string
): Promise<{ flow: FlowGraph; warnings: string[] }> {
  const warnings: string[] = [];

  // Pull initiator profile + all memberships once — we need it for both the
  // "management tier" escalation test and the per-dept lead lookup.
  const [initiator, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: initiatorId }, select: { role: true } }),
    prisma.departmentMembership.findMany({
      where: { userId: initiatorId },
      include: { department: { select: { leadUserId: true, name: true } } },
    }),
  ]);

  const initiatorRole = initiator?.role ?? 'MEMBER';
  const isManagementInitiator =
    initiatorRole === 'SUPER_ADMIN' ||
    initiatorRole === 'ADMIN' ||
    memberships.some((m) => m.role === 'LEAD' || m.role === 'ADMIN');

  let cachedFounders: string[] | null = null;
  async function getFounders() {
    if (cachedFounders) return cachedFounders;
    const rows = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', active: true },
      select: { id: true },
    });
    cachedFounders = rows.map((r) => r.id).filter((id) => id !== initiatorId);
    // If the initiator IS the sole super admin, we still surface them and
    // let the downstream submit guard produce a clear "need another admin"
    // error rather than silently approving.
    if (cachedFounders.length === 0) cachedFounders = rows.map((r) => r.id);
    return cachedFounders;
  }

  let initiatorDeptLeadIds: string[] | null = null;
  async function getInitiatorDeptLeads() {
    if (initiatorDeptLeadIds !== null) return initiatorDeptLeadIds;
    const allLeads = memberships
      .map((m) => m.department.leadUserId)
      .filter((x): x is string => !!x);
    const withoutSelf = allLeads.filter((x) => x !== initiatorId);
    initiatorDeptLeadIds = Array.from(new Set(withoutSelf.length > 0 ? withoutSelf : allLeads));
    return initiatorDeptLeadIds;
  }

  const nextNodes: FlowNode[] = [];
  for (const n of flow.nodes) {
    if (n.type !== 'approval') { nextNodes.push(n); continue; }
    const src = n.data.approverSource ?? 'SPECIFIC';
    if (src === 'SPECIFIC') { nextNodes.push(n); continue; }

    let resolved: string[] = [];
    let effectiveSrc = src;

    if (src === 'INITIATOR_DEPT_LEAD') {
      // Management-tier initiators bypass their "peers" and go straight to
      // the founder — nobody approves their own level.
      if (isManagementInitiator) {
        resolved = await getFounders();
        effectiveSrc = 'FOUNDER';
        warnings.push(`节点"${n.data.label ?? n.id}": 发起人为管理层，自动升级到总管理者审批`);
      } else {
        resolved = await getInitiatorDeptLeads();
        // Fallback: if we couldn't resolve a dept lead (no membership, or
        // their lead IS them), escalate to SUPER_ADMIN rather than dropping
        // the node. This matches the "所有部门负责人审批最终都到总管理者"
        // safety policy.
        if (resolved.length === 0) {
          resolved = await getFounders();
          effectiveSrc = 'FOUNDER';
          warnings.push(`节点"${n.data.label ?? n.id}": 发起人无可用的部门负责人，已转由总管理者审批`);
        }
      }
    } else if (src === 'DEPT_LEAD' && n.data.sourceDepartmentId) {
      const d = await prisma.department.findUnique({
        where: { id: n.data.sourceDepartmentId },
        select: { leadUserId: true, name: true },
      });
      if (d?.leadUserId && d.leadUserId !== initiatorId) {
        resolved = [d.leadUserId];
      } else {
        // Same safety net for DEPT_LEAD nodes: if that dept has no lead, or
        // the lead is the initiator themselves, fall through to founder.
        resolved = await getFounders();
        effectiveSrc = 'FOUNDER';
        warnings.push(`节点"${n.data.label ?? n.id}": 部门"${d?.name ?? '未知'}"的负责人不可用，已转由总管理者审批`);
      }
    } else if (src === 'FOUNDER') {
      resolved = await getFounders();
      if (resolved.length === 0) {
        warnings.push(`节点"${n.data.label ?? n.id}": 系统暂无有效的总管理者`);
      }
    }

    // Merge resolved users with pre-selected specific approvers (if any) so
    // a template author can still specify fallbacks.
    const merged = Array.from(new Set([...resolved, ...(n.data.approvers ?? [])]));
    nextNodes.push({ ...n, data: { ...n.data, approvers: merged, approverSource: effectiveSrc } });
  }
  return { flow: { ...flow, nodes: nextNodes }, warnings };
}

// Instantiate approval steps for a given nodeId. Called when the flow enters
// a new node. START/END/CC nodes don't require human action; APPROVAL nodes
// create one ApprovalStep row per required approver. Pass the Prisma tx.
export async function enterNode(
  tx: any,
  instanceId: string,
  nodeId: string,
  flow: FlowGraph,
  form?: Record<string, any>
): Promise<{ done: boolean; terminalStatus?: 'APPROVED' | 'REJECTED'; newStepIds?: string[] }> {
  const node = findNodeById(flow, nodeId);
  if (!node) {
    // Unknown node — treat as end.
    await tx.approvalInstance.update({
      where: { id: instanceId },
      data: { status: 'APPROVED', completedAt: new Date(), currentNodeId: null },
    });
    return { done: true, terminalStatus: 'APPROVED' };
  }

  if (node.type === 'end') {
    await tx.approvalInstance.update({
      where: { id: instanceId },
      data: { status: 'APPROVED', completedAt: new Date(), currentNodeId: null },
    });
    return { done: true, terminalStatus: 'APPROVED' };
  }

  if (node.type === 'cc') {
    const ccUsers = (node.data.ccUsers ?? []) as string[];
    if (ccUsers.length > 0) {
      await tx.approvalStep.createMany({
        data: ccUsers.map((uid) => ({
          instanceId,
          nodeId: node.id,
          kind: 'CC',
          approverId: uid,
          decision: 'APPROVED',
          decidedAt: new Date(),
        })),
      });
    }
    const nxt = nextNodeId(flow, node.id);
    if (!nxt) {
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'APPROVED', completedAt: new Date(), currentNodeId: null },
      });
      return { done: true, terminalStatus: 'APPROVED' };
    }
    return enterNode(tx, instanceId, nxt, flow, form);
  }

  if (node.type === 'condition') {
    // Evaluate and jump. No steps are created for condition nodes — they're
    // silent routing.
    const nxt = form ? evaluateCondition(node, form, flow) : nextNodeId(flow, node.id);
    if (!nxt) {
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'APPROVED', completedAt: new Date(), currentNodeId: null },
      });
      return { done: true, terminalStatus: 'APPROVED' };
    }
    return enterNode(tx, instanceId, nxt, flow, form);
  }

  if (node.type === 'approval') {
    const approvers = (node.data.approvers ?? []) as string[];
    if (approvers.length === 0) {
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'REJECTED', completedAt: new Date(), currentNodeId: null },
      });
      return { done: true, terminalStatus: 'REJECTED' };
    }
    const created = await Promise.all(
      approvers.map((uid) => tx.approvalStep.create({
        data: {
          instanceId,
          nodeId: node.id,
          kind: 'APPROVAL',
          mode: (node.data.mode as 'ALL' | 'ANY' | undefined) ?? 'ALL',
          approverId: uid,
        },
      }))
    );
    await tx.approvalInstance.update({
      where: { id: instanceId },
      data: { currentNodeId: node.id },
    });
    return { done: false, newStepIds: created.map((s: any) => s.id) };
  }

  // Start node: just advance.
  const nxt = nextNodeId(flow, node.id);
  if (!nxt) {
    await tx.approvalInstance.update({
      where: { id: instanceId },
      data: { status: 'APPROVED', completedAt: new Date(), currentNodeId: null },
    });
    return { done: true, terminalStatus: 'APPROVED' };
  }
  return enterNode(tx, instanceId, nxt, flow, form);
}

// Apply an approver's decision; advance the flow if the node is satisfied.
// Returns the updated instance status + any new pending step ids (so the
// caller can fire notifications to the next approvers).
export async function applyDecision(
  instanceId: string,
  stepId: string,
  decision: 'APPROVED' | 'REJECTED',
  actorId: string,
  note: string | null
): Promise<{ status: string; currentNodeId: string | null; newStepIds: string[] }> {
  return prisma.$transaction(async (tx) => {
    const step = await tx.approvalStep.findUnique({ where: { id: stepId } });
    if (!step) throw new Error('STEP_NOT_FOUND');
    if (step.decision) throw new Error('ALREADY_DECIDED');
    if (step.approverId !== actorId) throw new Error('NOT_YOUR_STEP');

    const instance = await tx.approvalInstance.findUnique({ where: { id: instanceId } });
    if (!instance) throw new Error('INSTANCE_NOT_FOUND');
    if (instance.status !== 'IN_PROGRESS') throw new Error('INSTANCE_FINALISED');

    await tx.approvalStep.update({
      where: { id: stepId },
      data: { decision, note, decidedAt: new Date() },
    });

    if (decision === 'REJECTED') {
      await tx.approvalStep.updateMany({
        where: { instanceId, decision: null },
        data: { superseded: true },
      });
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'REJECTED', completedAt: new Date(), currentNodeId: null },
      });
      return { status: 'REJECTED', currentNodeId: null, newStepIds: [] };
    }

    // APPROVED — check if node is satisfied.
    const siblingSteps = await tx.approvalStep.findMany({
      where: { instanceId, nodeId: step.nodeId, superseded: false },
    });
    const mode = step.mode ?? 'ALL';

    const anyRejected = siblingSteps.some((s) => s.decision === 'REJECTED');
    if (anyRejected) {
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'REJECTED', completedAt: new Date(), currentNodeId: null },
      });
      return { status: 'REJECTED', currentNodeId: null, newStepIds: [] };
    }

    let nodeSatisfied = false;
    if (mode === 'ANY') {
      nodeSatisfied = siblingSteps.some((s) => s.decision === 'APPROVED');
      // Supersede remaining pending siblings in ANY mode.
      if (nodeSatisfied) {
        await tx.approvalStep.updateMany({
          where: { instanceId, nodeId: step.nodeId, decision: null },
          data: { superseded: true },
        });
      }
    } else {
      nodeSatisfied = siblingSteps.every((s) => s.decision === 'APPROVED');
    }

    if (!nodeSatisfied) {
      return { status: 'IN_PROGRESS', currentNodeId: instance.currentNodeId, newStepIds: [] };
    }

    // Advance to next node.
    const flow = parseFlow(instance.flowSnapshot);
    const form = JSON.parse(instance.formJson || '{}');
    const nxtId = nextNodeId(flow, step.nodeId);
    if (!nxtId) {
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'APPROVED', completedAt: new Date(), currentNodeId: null },
      });
      return { status: 'APPROVED', currentNodeId: null, newStepIds: [] };
    }
    const result = await enterNode(tx, instanceId, nxtId, flow, form);
    if (result.done) {
      return { status: result.terminalStatus ?? 'APPROVED', currentNodeId: null, newStepIds: [] };
    }
    const fresh = await tx.approvalInstance.findUnique({ where: { id: instanceId } });
    return { status: 'IN_PROGRESS', currentNodeId: fresh?.currentNodeId ?? null, newStepIds: result.newStepIds ?? [] };
  });
}

// Admin force-override: a SUPER_ADMIN/ADMIN can finalise any in-progress
// instance from the backend without being an assigned approver. We
// supersede every pending step, stamp a new OVERRIDE step attributed to
// the admin for the audit trail, and push the instance to the terminal
// state. Returns the final status so the caller can notify the initiator.
export async function adminForceDecide(
  instanceId: string,
  decision: 'APPROVED' | 'REJECTED',
  actorId: string,
  note: string | null
): Promise<{ status: string }> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.approvalInstance.findUnique({ where: { id: instanceId } });
    if (!instance) throw new Error('INSTANCE_NOT_FOUND');
    if (instance.status !== 'IN_PROGRESS') throw new Error('INSTANCE_FINALISED');

    // Mark all pending APPROVAL steps as superseded so the audit log shows
    // they were skipped, not silently ignored.
    await tx.approvalStep.updateMany({
      where: { instanceId, decision: null, kind: 'APPROVAL' },
      data: { superseded: true },
    });

    // Insert an explicit override step attributed to the admin so the
    // timeline reflects "approved by admin override" instead of vanishing.
    await tx.approvalStep.create({
      data: {
        instanceId,
        nodeId: instance.currentNodeId ?? 'override',
        kind: 'APPROVAL',
        approverId: actorId,
        decision,
        note: note ? `[管理员后台操作] ${note}` : '[管理员后台操作]',
        decidedAt: new Date(),
      },
    });

    await tx.approvalInstance.update({
      where: { id: instanceId },
      data: { status: decision, completedAt: new Date(), currentNodeId: null },
    });

    return { status: decision };
  });
}

// Start a fresh instance by stepping past the start node. Returns the ids
// of the initial pending ApprovalStep rows so the caller can email them.
export async function startInstance(
  instanceId: string,
  flow: FlowGraph,
  form: Record<string, any>
): Promise<{ newStepIds: string[]; finalStatus: string | null }> {
  const start = findStartNode(flow);
  if (!start) throw new Error('NO_START_NODE');
  return prisma.$transaction(async (tx) => {
    const res = await enterNode(tx, instanceId, start.id, flow, form);
    return {
      newStepIds: res.newStepIds ?? [],
      finalStatus: res.done ? (res.terminalStatus ?? null) : null,
    };
  });
}
