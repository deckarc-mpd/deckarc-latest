// Action Center (Frozen §18): exactly six queues, shared across every
// agent/SOP — never a separate inbox per agent. This is pure/testable
// mapping logic; the caller (a future Action Center data-loading hook or
// API route) is responsible for loading the raw audit/action-item data and
// handing it in already shaped — this file makes no Supabase call itself,
// same discipline as the sweep orchestrator and Chief of Staff synthesis.

import type { BoardItemSummary } from '../../../actionBoardHelpers.ts';
import type { ApprovalRecord, WorkflowRun } from '../../types.ts';

export type ActionCenterQueueName =
  | 'needs_my_decision'
  | 'critical_now'
  | 'ai_handling'
  | 'watching'
  | 'completed'
  | 'blocked';

export interface QueueItem {
  id: string;
  queue: ActionCenterQueueName;
  title: string;
  subtitle: string;
  projectId: string | null;
}

interface WorkflowRunWithSopTitle {
  run: WorkflowRun;
  sopTitle: string;
}

export interface ActionCenterInput {
  /** From actionBoardHelpers.getCriticalItems(). */
  criticalItems: BoardItemSummary[];
  /** From actionBoardHelpers.getNeedsReviewItems(). */
  needsReviewItems: BoardItemSummary[];
  /** Workflow runs currently `waiting_approval`, joined to their pending approval record and SOP title. */
  pendingApprovals: Array<{ approval: ApprovalRecord; run: WorkflowRun; sopTitle: string }>;
  /** Workflow runs currently `running` — code/AI actively working, no human input needed yet. */
  runningWorkflowRuns: WorkflowRunWithSopTitle[];
  /** Workflow runs that reached `completed` within the caller's lookback window. */
  completedWorkflowRuns: WorkflowRunWithSopTitle[];
  /** Workflow runs that reached `failed` — stuck; nothing proceeds without intervention. */
  failedWorkflowRuns: WorkflowRunWithSopTitle[];
}

export interface ActionCenterQueues {
  needsMyDecision: QueueItem[];
  criticalNow: QueueItem[];
  aiHandling: QueueItem[];
  watching: QueueItem[];
  completed: QueueItem[];
  blocked: QueueItem[];
}

/**
 * Builds the six queues from already-resolved input. Queue membership
 * rules (why an item lands in exactly one queue, not several):
 *  - Needs My Decision: a workflow run is waiting on a human approval —
 *    the single clearest "you must act" signal available.
 *  - Critical Now: an Action Board critical item, EXCLUDING any project
 *    that already has a pending approval — the same underlying problem
 *    should not compete for attention in two queues at once (Frozen §17:
 *    no noise beyond what changes a decision).
 *  - AI Handling: a workflow run is actively executing — informational,
 *    nothing for a human to do yet.
 *  - Watching: lower-urgency items being monitored (Action Board
 *    needs-review items) — worth seeing, not worth interrupting for.
 *  - Completed: a workflow run finished successfully — confirmation
 *    something got done.
 *  - Blocked: a workflow run failed (an approval was rejected, an
 *    authority check denied, or a verification mismatch was caught) —
 *    distinct from Critical Now because nothing will progress here without
 *    someone changing course, not just reviewing.
 */
export function buildActionCenterQueues(input: ActionCenterInput): ActionCenterQueues {
  const needsMyDecision: QueueItem[] = input.pendingApprovals.map(({ approval, run, sopTitle }) => ({
    id: `approval-${approval.id}`,
    queue: 'needs_my_decision',
    title: sopTitle,
    subtitle: `Awaiting your decision`,
    projectId: run.projectId,
  }));

  const projectsWithPendingApproval = new Set(
    input.pendingApprovals.map((p) => p.run.projectId).filter((id): id is string => id !== null)
  );
  const criticalNow: QueueItem[] = input.criticalItems
    .filter((item) => !projectsWithPendingApproval.has(item.projectId))
    .map((item) => ({
      id: `critical-${item.id}`,
      queue: 'critical_now',
      title: item.title,
      subtitle: item.subtitle,
      projectId: item.projectId,
    }));

  const aiHandling: QueueItem[] = input.runningWorkflowRuns.map(({ run, sopTitle }) => ({
    id: `running-${run.id}`,
    queue: 'ai_handling',
    title: sopTitle,
    subtitle: 'In progress',
    projectId: run.projectId,
  }));

  const watching: QueueItem[] = input.needsReviewItems.map((item) => ({
    id: `watch-${item.id}`,
    queue: 'watching',
    title: item.title,
    subtitle: item.subtitle,
    projectId: item.projectId,
  }));

  const completed: QueueItem[] = input.completedWorkflowRuns.map(({ run, sopTitle }) => ({
    id: `completed-${run.id}`,
    queue: 'completed',
    title: sopTitle,
    subtitle: 'Completed',
    projectId: run.projectId,
  }));

  const blocked: QueueItem[] = input.failedWorkflowRuns.map(({ run, sopTitle }) => ({
    id: `blocked-${run.id}`,
    queue: 'blocked',
    title: sopTitle,
    subtitle: 'Blocked — needs intervention',
    projectId: run.projectId,
  }));

  return { needsMyDecision, criticalNow, aiHandling, watching, completed, blocked };
}

export function totalActionCenterItems(queues: ActionCenterQueues): number {
  return (
    queues.needsMyDecision.length +
    queues.criticalNow.length +
    queues.aiHandling.length +
    queues.watching.length +
    queues.completed.length +
    queues.blocked.length
  );
}
