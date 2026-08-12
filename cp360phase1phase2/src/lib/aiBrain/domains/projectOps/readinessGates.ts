// CP360 AI Operations Brain — Project Ops deterministic readiness gates.
//
// 100% CODE tier, per Frozen §7: dates, status comparisons, and dependency
// lookups are exactly the kind of thing deterministic code answers reliably
// and completely, so none of this ever calls a model. This module produces
// the ONLY verdict that matters for readiness — the AI interpreter
// (aiInterpreter.ts) may explain WHY a gate failed in plain language, but
// never gets a vote on whether it failed.
//
// Mirrors the query/threshold conventions already established elsewhere in
// the app rather than inventing new ones:
//   - the "tomorrow" bucket logic matches src/pages/TomorrowWorkPage.tsx
//   - the 3-day daily-update staleness threshold matches
//     src/components/project/AiSummaryTab.tsx's existing
//     "No updates in the last 3 days" check
//   - status vocabularies (confirmation_status, material_ready_status,
//     task status) match the enums used in CrewConfirmationsTab.tsx /
//     MaterialsTab.tsx / src/lib/supabase.ts exactly.

import type {
  ReadinessTask,
  ReadinessCrewConfirmation,
  ReadinessMaterial,
  ReadinessDailyUpdate,
  GateResult,
  DeterministicReadinessResult,
  OverallReadinessStatus,
} from './types';

const DAILY_UPDATE_STALENESS_DAYS = 3;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

// ─── Gate 1: Field Progress ─────────────────────────────────────────────────

export function checkFieldProgressGate(
  asOfDate: string,
  tasks: ReadinessTask[],
  dailyUpdates: ReadinessDailyUpdate[]
): GateResult {
  const findings: string[] = [];
  const inProgress = tasks.filter((t) => t.status === 'In Progress');

  for (const task of inProgress) {
    const updatesForTask = dailyUpdates
      .filter((u) => u.task_id === task.id)
      .sort((a, b) => (a.update_date < b.update_date ? 1 : -1));
    const latest = updatesForTask[0];

    if (!latest || daysBetween(asOfDate, latest.update_date) > DAILY_UPDATE_STALENESS_DAYS) {
      findings.push(`${task.task_name}: no daily update in the last ${DAILY_UPDATE_STALENESS_DAYS} days`);
      continue;
    }
    if (latest.delay_days > 0) {
      findings.push(`${task.task_name}: reported delay of ${latest.delay_days} day(s) — ${latest.delay_reason || 'no reason given'}`);
    }
    if (latest.blockers.trim()) {
      findings.push(`${task.task_name}: blocker reported — ${latest.blockers.trim()}`);
    }
  }

  return { gate: 'field_progress', status: findings.length === 0 ? 'ready' : 'not_ready', findings };
}

// ─── Gate 2: Dependency readiness ───────────────────────────────────────────

export function checkDependencyGate(asOfDate: string, tasks: ReadinessTask[]): GateResult {
  const findings: string[] = [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const startingTomorrow = tasks.filter(
    (t) => t.planned_start_date === asOfDate || t.projected_start_date === asOfDate
  );

  for (const task of startingTomorrow) {
    if (!task.dependency_task_id) continue;
    const dependency = taskById.get(task.dependency_task_id);
    if (!dependency) {
      findings.push(`${task.task_name}: depends on an unknown task (${task.dependency_task_id})`);
      continue;
    }
    if (dependency.status !== 'Completed') {
      findings.push(`${task.task_name}: waiting on "${dependency.task_name}" (currently ${dependency.status})`);
    }
  }

  return { gate: 'dependency', status: findings.length === 0 ? 'ready' : 'not_ready', findings };
}

// ─── Gate 3: Subcontractor coordination ─────────────────────────────────────

export function checkSubcontractorGate(
  asOfDate: string,
  confirmations: ReadinessCrewConfirmation[]
): GateResult {
  const findings: string[] = [];
  const tomorrow = confirmations.filter((c) => c.scheduled_date === asOfDate);

  for (const c of tomorrow) {
    const issues: string[] = [];
    if (c.confirmation_status !== 'Confirmed') issues.push(`status: ${c.confirmation_status}`);
    if (!c.crew_available) issues.push('crew availability not confirmed');
    if (!c.start_time_confirmed) issues.push('start time not confirmed');
    if (!c.site_access_confirmed) issues.push('site access not confirmed');
    if (issues.length > 0) {
      findings.push(`Crew confirmation ${c.id}: ${issues.join(', ')}`);
    }
  }

  return { gate: 'subcontractor', status: findings.length === 0 ? 'ready' : 'not_ready', findings };
}

// ─── Gate 4: Materials ───────────────────────────────────────────────────────

export function checkMaterialsGate(
  asOfDate: string,
  tasks: ReadinessTask[],
  materials: ReadinessMaterial[]
): GateResult {
  const findings: string[] = [];
  const tomorrowTaskIds = new Set(
    tasks
      .filter((t) => t.planned_start_date === asOfDate || t.projected_start_date === asOfDate)
      .map((t) => t.id)
  );

  const relevant = materials.filter(
    (m) => m.expected_delivery_date === asOfDate || (m.related_task_id && tomorrowTaskIds.has(m.related_task_id))
  );

  for (const m of relevant) {
    if (m.material_ready_status !== 'Ready') {
      findings.push(`${m.material_name}: ${m.material_ready_status}`);
    }
  }

  return { gate: 'materials', status: findings.length === 0 ? 'ready' : 'not_ready', findings };
}

// ─── Rollup ──────────────────────────────────────────────────────────────────

function rollUpStatus(gates: GateResult[]): OverallReadinessStatus {
  const byGate = new Map(gates.map((g) => [g.gate, g.status]));
  // A missed dependency or an unresolved field blocker means tomorrow's work
  // literally cannot proceed as planned — that's a hard block, not a risk.
  if (byGate.get('dependency') === 'not_ready' || byGate.get('field_progress') === 'not_ready') {
    return 'blocked';
  }
  // Crew or material gaps are real risk but work could still start or be
  // partially performed while they're chased down.
  if (byGate.get('subcontractor') === 'not_ready' || byGate.get('materials') === 'not_ready') {
    return 'at_risk';
  }
  return 'ready';
}

export function assessTomorrowReadiness(
  projectId: string,
  asOfDate: string,
  tasks: ReadinessTask[],
  crewConfirmations: ReadinessCrewConfirmation[],
  materials: ReadinessMaterial[],
  dailyUpdates: ReadinessDailyUpdate[]
): DeterministicReadinessResult {
  const gates = [
    checkFieldProgressGate(asOfDate, tasks, dailyUpdates),
    checkDependencyGate(asOfDate, tasks),
    checkSubcontractorGate(asOfDate, crewConfirmations),
    checkMaterialsGate(asOfDate, tasks, materials),
  ];

  return { projectId, asOfDate, gates, overallStatus: rollUpStatus(gates) };
}
