// CP360 AI Operations Brain — Project Ops trade/material coordination
// (Phase 3, Frozen §11's "Trade Confirmation Cutoff" routine + §4's Project
// Ops scope: "subcontractor coordination, materials... dependencies").
//
// 100% CODE tier, same as readinessGates.ts (Phase 2) — every function here
// is a pure, deterministic fact-finder. Whether the facts found are
// "escalation-worthy" (decideEscalation) is ALSO deterministic: this phase
// exists specifically because no automated remedy is available yet (no
// Integration Gateway to send a confirmation-request message — see
// ADR-CP360-AI-001), so once a genuine issue is detected, a human is the
// only next step; deciding *whether* something is a genuine issue must not
// be left to a model's opinion any more than the readiness gates were.

import type {
  ReadinessTask,
  ReadinessCrewConfirmation,
  ReadinessMaterial,
  TradeConfirmationIssue,
  MaterialScheduleRisk,
  TradeMaterialCoordinationResult,
} from './types.ts';

// ─── Trade confirmation cutoff ──────────────────────────────────────────────
//
// Frozen §11 (16:00 Trade Confirmation Cutoff): "Deterministic check: which
// crews scheduled for tomorrow have confirmation_status != 'Confirmed' past
// the cutoff. Workflow/message automation attempts contact first." The
// automated-outreach half of that routine needs the Integration Gateway
// (Gmail/Calendar), which Phase 0 Discovery confirmed does not exist yet —
// so this phase's honest scope is the deterministic detection half, with
// escalation standing in for automated outreach until the Gateway exists.

export function checkTradeConfirmationCutoff(
  asOfDate: string,
  crewConfirmations: ReadinessCrewConfirmation[]
): TradeConfirmationIssue[] {
  const issues: TradeConfirmationIssue[] = [];

  for (const c of crewConfirmations) {
    if (c.scheduled_date !== asOfDate) continue;
    if (c.confirmation_status === 'Confirmed') continue;

    const reasons: string[] = [`confirmation status: ${c.confirmation_status}`];
    if (!c.crew_available) reasons.push('crew availability not confirmed');
    if (!c.start_time_confirmed) reasons.push('start time not confirmed');
    if (!c.site_access_confirmed) reasons.push('site access not confirmed');

    issues.push({ confirmationId: c.id, taskId: c.task_id, confirmationStatus: c.confirmation_status, reasons });
  }

  return issues;
}

// ─── Material readiness tied to schedule dependencies ──────────────────────
//
// Distinct from readinessGates.ts's checkMaterialsGate (Phase 2), which only
// asks "is a material due tomorrow ready?" This asks the schedule-dependency
// question Phase 3 was asked to add: if a not-yet-started task's material
// won't be ready in time, which OTHER tasks — the ones depending on this one
// — are now also at risk, even though nothing is wrong with them directly?

function findDownstreamTaskIds(rootTaskId: string, tasks: ReadinessTask[]): string[] {
  const downstream: string[] = [];
  const queue: string[] = [rootTaskId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const t of tasks) {
      if (t.dependency_task_id === current && !visited.has(t.id)) {
        downstream.push(t.id);
        queue.push(t.id);
      }
    }
  }

  return downstream;
}

export function assessMaterialScheduleRisk(
  tasks: ReadinessTask[],
  materials: ReadinessMaterial[]
): MaterialScheduleRisk[] {
  const risks: MaterialScheduleRisk[] = [];
  // Only tasks that haven't started yet have a "schedule dependency" story —
  // an in-progress task's material shortfall is Phase 2's field-progress /
  // materials gate territory, not a future-cascade question.
  const notStarted = tasks.filter((t) => t.status === 'Not Started');

  for (const task of notStarted) {
    const taskStart = task.planned_start_date || task.projected_start_date;
    if (!taskStart) continue;

    const relatedMaterials = materials.filter((m) => m.related_task_id === task.id && m.material_ready_status !== 'Ready');
    for (const material of relatedMaterials) {
      // Risk when there is no confirmed delivery date at all (unbounded
      // risk), or the delivery date offers no buffer before the task needs
      // to start (arrives on or after the day work is supposed to begin).
      const noEta = !material.expected_delivery_date;
      const tooLate = material.expected_delivery_date !== null && material.expected_delivery_date >= taskStart;
      if (!noEta && !tooLate) continue;

      const downstreamImpactedTaskIds = findDownstreamTaskIds(task.id, tasks);
      risks.push({
        taskId: task.id,
        taskName: task.task_name,
        materialId: material.id,
        materialName: material.material_name,
        materialStatus: material.material_ready_status,
        expectedDeliveryDate: material.expected_delivery_date,
        reason: noEta
          ? `${material.material_name} has no confirmed delivery date and is ${material.material_ready_status}`
          : `${material.material_name} is not expected until ${material.expected_delivery_date}, on or after ${task.task_name}'s start date (${taskStart})`,
        downstreamImpactedTaskIds,
      });
    }
  }

  return risks;
}

// ─── Escalation decision (deterministic) ────────────────────────────────────

export function decideEscalation(
  tradeConfirmationIssues: TradeConfirmationIssue[],
  materialScheduleRisks: MaterialScheduleRisk[]
): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Any unconfirmed crew past the cutoff is inherently schedule-threatening
  // — work literally cannot proceed without a confirmed crew, and with no
  // automated outreach available, only a human can resolve it now.
  for (const issue of tradeConfirmationIssues) {
    reasons.push(`Trade confirmation ${issue.confirmationId}: ${issue.reasons.join(', ')}`);
  }

  // A material risk escalates only when it has real teeth: it cascades to
  // other tasks, or its arrival is completely unknown. A material that's
  // merely "Partially Ready" with a known near-term date but no downstream
  // dependents stays in the ordinary readiness assessment (Phase 2) rather
  // than paging a human.
  for (const risk of materialScheduleRisks) {
    if (risk.downstreamImpactedTaskIds.length > 0 || risk.expectedDeliveryDate === null) {
      reasons.push(
        `Material risk on "${risk.taskName}" (${risk.materialName}): ${risk.reason}` +
          (risk.downstreamImpactedTaskIds.length > 0
            ? ` — threatens ${risk.downstreamImpactedTaskIds.length} downstream task(s)`
            : '')
      );
    }
  }

  return { required: reasons.length > 0, reasons };
}

export function assessTradeMaterialCoordination(
  projectId: string,
  asOfDate: string,
  tasks: ReadinessTask[],
  crewConfirmations: ReadinessCrewConfirmation[],
  materials: ReadinessMaterial[]
): TradeMaterialCoordinationResult {
  const tradeConfirmationIssues = checkTradeConfirmationCutoff(asOfDate, crewConfirmations);
  const materialScheduleRisks = assessMaterialScheduleRisk(tasks, materials);
  const { required, reasons } = decideEscalation(tradeConfirmationIssues, materialScheduleRisks);

  return {
    projectId,
    asOfDate,
    tradeConfirmationIssues,
    materialScheduleRisks,
    escalationRequired: required,
    escalationReasons: reasons,
  };
}
