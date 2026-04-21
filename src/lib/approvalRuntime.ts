import { prisma } from './db';
import { parseFlow, nextNodeId, findStartNode, findNodeById, type FlowGraph } from './approvalFlow';

// Instantiate approval steps for a given nodeId. Called when the flow enters
// a new node. START/END/CC nodes don't require human action; APPROVAL nodes
// create one ApprovalStep row per required approver. Pass the Prisma tx.
export async function enterNode(
  tx: any,
  instanceId: string,
  nodeId: string,
  flow: FlowGraph
): Promise<{ done: boolean; terminalStatus?: 'APPROVED' | 'REJECTED' }> {
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
    // CC is a pass-through: create notification steps and immediately advance.
    const ccUsers = (node.data.ccUsers ?? []) as string[];
    if (ccUsers.length > 0) {
      await tx.approvalStep.createMany({
        data: ccUsers.map((uid) => ({
          instanceId,
          nodeId: node.id,
          kind: 'CC',
          approverId: uid,
          decision: 'APPROVED', // mark done so the row doesn't count as pending
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
    return enterNode(tx, instanceId, nxt, flow);
  }

  if (node.type === 'approval') {
    const approvers = (node.data.approvers ?? []) as string[];
    if (approvers.length === 0) {
      // No approver configured — invalid flow. Reject so the instance doesn't
      // hang forever.
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'REJECTED', completedAt: new Date(), currentNodeId: null },
      });
      return { done: true, terminalStatus: 'REJECTED' };
    }
    await tx.approvalStep.createMany({
      data: approvers.map((uid) => ({
        instanceId,
        nodeId: node.id,
        kind: 'APPROVAL',
        mode: (node.data.mode as 'ALL' | 'ANY' | undefined) ?? 'ALL',
        approverId: uid,
      })),
    });
    await tx.approvalInstance.update({
      where: { id: instanceId },
      data: { currentNodeId: node.id },
    });
    return { done: false };
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
  return enterNode(tx, instanceId, nxt, flow);
}

// Apply an approver's decision; advance the flow if the node is satisfied.
// Returns the updated instance status.
export async function applyDecision(
  instanceId: string,
  stepId: string,
  decision: 'APPROVED' | 'REJECTED',
  actorId: string,
  note: string | null
): Promise<{ status: string; currentNodeId: string | null }> {
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
      // Any reject kills the instance; mark other pending steps as superseded.
      await tx.approvalStep.updateMany({
        where: { instanceId, decision: null },
        data: { superseded: true },
      });
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'REJECTED', completedAt: new Date(), currentNodeId: null },
      });
      return { status: 'REJECTED', currentNodeId: null };
    }

    // APPROVED — check if node is satisfied.
    const siblingSteps = await tx.approvalStep.findMany({
      where: { instanceId, nodeId: step.nodeId, superseded: false },
    });
    const mode = step.mode ?? 'ALL';

    const anyRejected = siblingSteps.some((s) => s.decision === 'REJECTED');
    if (anyRejected) {
      // Shouldn't happen here since we handle REJECT above, but bail safely.
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'REJECTED', completedAt: new Date(), currentNodeId: null },
      });
      return { status: 'REJECTED', currentNodeId: null };
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
      return { status: 'IN_PROGRESS', currentNodeId: instance.currentNodeId };
    }

    // Advance to next node.
    const flow = parseFlow(instance.flowSnapshot);
    const nxtId = nextNodeId(flow, step.nodeId);
    if (!nxtId) {
      await tx.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'APPROVED', completedAt: new Date(), currentNodeId: null },
      });
      return { status: 'APPROVED', currentNodeId: null };
    }
    const result = await enterNode(tx, instanceId, nxtId, flow);
    if (result.done) {
      return { status: result.terminalStatus ?? 'APPROVED', currentNodeId: null };
    }
    // Re-read current node after advancing.
    const fresh = await tx.approvalInstance.findUnique({ where: { id: instanceId } });
    return { status: 'IN_PROGRESS', currentNodeId: fresh?.currentNodeId ?? null };
  });
}

// Start a fresh instance by stepping past the start node.
export async function startInstance(instanceId: string, flow: FlowGraph) {
  const start = findStartNode(flow);
  if (!start) throw new Error('NO_START_NODE');
  return prisma.$transaction(async (tx) => {
    await enterNode(tx, instanceId, start.id, flow);
  });
}
