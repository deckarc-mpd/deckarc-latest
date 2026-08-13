// Five representative projects for testing the Project Ops agent's Tomorrow
// Readiness SOP end to end (Phase 2 exit gate: "test against 3-5 real or
// representative projects"). This sandbox has no live Supabase connection
// (see CP360_AI_COST_BASELINE.md), so these are hand-built fixtures shaped
// exactly like real CP360 rows (same status vocabularies as
// CrewConfirmationsTab.tsx / MaterialsTab.tsx / src/lib/supabase.ts) rather
// than pulled from a live project — each one exercises a distinct,
// realistic field-operations scenario a DeckArc-style remodeler would
// actually hit.

import type {
  ReadinessTask,
  ReadinessCrewConfirmation,
  ReadinessMaterial,
  ReadinessDailyUpdate,
  OverallReadinessStatus,
} from '../types.ts';

export const TOMORROW = '2026-08-13';

export interface RepresentativeProject {
  projectId: string;
  projectName: string;
  asOfDate: string;
  tasks: ReadinessTask[];
  crewConfirmations: ReadinessCrewConfirmation[];
  materials: ReadinessMaterial[];
  dailyUpdates: ReadinessDailyUpdate[];
  /** What a human reviewing this project's real data would expect — the test oracle. */
  expected: {
    overallStatus: OverallReadinessStatus;
    failedGates: string[];
    aiShouldBeInvoked: boolean;
  };
}

// ─── 1. Ganesh Residence Addition — everything on track ────────────────────

const ganesh: RepresentativeProject = {
  projectId: 'proj-ganesh', projectName: 'Ganesh Residence Addition', asOfDate: TOMORROW,
  tasks: [
    // Already-finished predecessor — satisfies t2's dependency gate.
    { id: 'ganesh-t0', project_id: 'proj-ganesh', task_name: 'Foundation Inspection', status: 'Completed', planned_start_date: null, projected_start_date: null, dependency_task_id: null, schedule_locked: false, blocked_reason: '' },
    // A separate, currently in-progress task with a fresh, clean update — satisfies the field-progress gate.
    { id: 'ganesh-t1', project_id: 'proj-ganesh', task_name: 'Drywall Hang', status: 'In Progress', planned_start_date: null, projected_start_date: null, dependency_task_id: null, schedule_locked: false, blocked_reason: '' },
    { id: 'ganesh-t2', project_id: 'proj-ganesh', task_name: 'Electrical Trim-Out', status: 'Not Started', planned_start_date: TOMORROW, projected_start_date: null, dependency_task_id: 'ganesh-t0', schedule_locked: false, blocked_reason: '' },
  ],
  crewConfirmations: [
    { id: 'ganesh-c1', project_id: 'proj-ganesh', task_id: 'ganesh-t2', scheduled_date: TOMORROW, confirmation_status: 'Confirmed', crew_available: true, start_time_confirmed: true, site_access_confirmed: true, questions_before_arrival: '', confirmation_notes: '' },
  ],
  materials: [
    { id: 'ganesh-m1', project_id: 'proj-ganesh', related_task_id: 'ganesh-t2', material_name: 'Outlet/Switch Kit', material_ready_status: 'Ready', expected_delivery_date: TOMORROW },
  ],
  dailyUpdates: [
    { id: 'ganesh-u1', project_id: 'proj-ganesh', task_id: 'ganesh-t1', update_date: '2026-08-12', current_status: 'On track', blockers: '', delay_reason: '', delay_days: 0, materials_pending: '', weather_issue: '' },
  ],
  expected: { overallStatus: 'ready', failedGates: [], aiShouldBeInvoked: false },
};

// ─── 2. Miller Kitchen Remodel — unmet dependency ───────────────────────────

const miller: RepresentativeProject = {
  projectId: 'proj-miller', projectName: 'Miller Kitchen Remodel', asOfDate: TOMORROW,
  tasks: [
    { id: 'miller-t1', project_id: 'proj-miller', task_name: 'Rough Plumbing Inspection', status: 'In Progress', planned_start_date: null, projected_start_date: null, dependency_task_id: null, schedule_locked: false, blocked_reason: '' },
    { id: 'miller-t2', project_id: 'proj-miller', task_name: 'Cabinet Installation', status: 'Not Started', planned_start_date: TOMORROW, projected_start_date: null, dependency_task_id: 'miller-t1', schedule_locked: false, blocked_reason: '' },
  ],
  crewConfirmations: [
    { id: 'miller-c1', project_id: 'proj-miller', task_id: 'miller-t2', scheduled_date: TOMORROW, confirmation_status: 'Confirmed', crew_available: true, start_time_confirmed: true, site_access_confirmed: true, questions_before_arrival: '', confirmation_notes: '' },
  ],
  materials: [
    { id: 'miller-m1', project_id: 'proj-miller', related_task_id: 'miller-t2', material_name: 'Cabinet Boxes', material_ready_status: 'Ready', expected_delivery_date: TOMORROW },
  ],
  dailyUpdates: [
    { id: 'miller-u1', project_id: 'proj-miller', task_id: 'miller-t1', update_date: '2026-08-12', current_status: 'Awaiting reinspection', blockers: '', delay_reason: '', delay_days: 0, materials_pending: '', weather_issue: '' },
  ],
  expected: { overallStatus: 'blocked', failedGates: ['dependency'], aiShouldBeInvoked: false },
};

// ─── 3. Thompson Deck Build — subcontractor not confirmed ───────────────────

const thompson: RepresentativeProject = {
  projectId: 'proj-thompson', projectName: 'Thompson Deck Build', asOfDate: TOMORROW,
  tasks: [
    { id: 'thompson-t1', project_id: 'proj-thompson', task_name: 'Deck Framing', status: 'In Progress', planned_start_date: null, projected_start_date: null, dependency_task_id: null, schedule_locked: false, blocked_reason: '' },
  ],
  crewConfirmations: [
    { id: 'thompson-c1', project_id: 'proj-thompson', task_id: 'thompson-t1', scheduled_date: TOMORROW, confirmation_status: 'Need Reschedule', crew_available: false, start_time_confirmed: false, site_access_confirmed: true, questions_before_arrival: '', confirmation_notes: 'Framing sub double-booked another job, asking to push two days' },
  ],
  materials: [],
  dailyUpdates: [
    { id: 'thompson-u1', project_id: 'proj-thompson', task_id: 'thompson-t1', update_date: '2026-08-12', current_status: 'On track', blockers: '', delay_reason: '', delay_days: 0, materials_pending: '', weather_issue: '' },
  ],
  expected: { overallStatus: 'at_risk', failedGates: ['subcontractor'], aiShouldBeInvoked: false },
};

// ─── 4. Patel Master Bath Addition — materials delayed + ambiguous access blocker ──

const patel: RepresentativeProject = {
  projectId: 'proj-patel', projectName: 'Patel Master Bath Addition', asOfDate: TOMORROW,
  tasks: [
    { id: 'patel-t1', project_id: 'proj-patel', task_name: 'Tile Setting', status: 'In Progress', planned_start_date: null, projected_start_date: null, dependency_task_id: null, schedule_locked: false, blocked_reason: '' },
  ],
  crewConfirmations: [
    { id: 'patel-c1', project_id: 'proj-patel', task_id: 'patel-t1', scheduled_date: TOMORROW, confirmation_status: 'Confirmed', crew_available: true, start_time_confirmed: true, site_access_confirmed: true, questions_before_arrival: '', confirmation_notes: '' },
  ],
  materials: [
    { id: 'patel-m1', project_id: 'proj-patel', related_task_id: 'patel-t1', material_name: 'Porcelain Tile', material_ready_status: 'Delayed', expected_delivery_date: TOMORROW },
  ],
  dailyUpdates: [
    { id: 'patel-u1', project_id: 'proj-patel', task_id: 'patel-t1', update_date: '2026-08-12', current_status: 'Blocked', blockers: 'HOA gate access code was not provided, crew could not get equipment onto the lot', delay_reason: 'Access', delay_days: 1, materials_pending: '', weather_issue: '' },
  ],
  expected: { overallStatus: 'blocked', failedGates: ['field_progress', 'materials'], aiShouldBeInvoked: true },
};

// ─── 5. Nguyen Whole-Home Renovation — multiple simultaneous failures ───────

const nguyen: RepresentativeProject = {
  projectId: 'proj-nguyen', projectName: 'Nguyen Whole-Home Renovation', asOfDate: TOMORROW,
  tasks: [
    { id: 'nguyen-t1', project_id: 'proj-nguyen', task_name: 'Structural Framing', status: 'In Progress', planned_start_date: null, projected_start_date: null, dependency_task_id: null, schedule_locked: false, blocked_reason: '' },
    { id: 'nguyen-t2', project_id: 'proj-nguyen', task_name: 'HVAC Rough-In', status: 'Not Started', planned_start_date: TOMORROW, projected_start_date: null, dependency_task_id: 'nguyen-t1', schedule_locked: false, blocked_reason: '' },
    // Downstream of t2 — nothing wrong with t3 itself, but it depends on t2,
    // which is itself blocked by a not-ready material with no confirmed
    // delivery date. This is the multi-hop cascade Phase 3 exists to catch:
    // a material problem two tasks upstream still threatens t3's schedule.
    { id: 'nguyen-t3', project_id: 'proj-nguyen', task_name: 'Drywall Hang', status: 'Not Started', planned_start_date: null, projected_start_date: '2026-08-17', dependency_task_id: 'nguyen-t2', schedule_locked: false, blocked_reason: '' },
  ],
  crewConfirmations: [
    { id: 'nguyen-c1', project_id: 'proj-nguyen', task_id: 'nguyen-t2', scheduled_date: TOMORROW, confirmation_status: 'Cannot Attend', crew_available: false, start_time_confirmed: false, site_access_confirmed: true, questions_before_arrival: '', confirmation_notes: 'No response after three calls to HVAC sub' },
  ],
  materials: [
    { id: 'nguyen-m1', project_id: 'proj-nguyen', related_task_id: 'nguyen-t2', material_name: 'Ductwork', material_ready_status: 'Not Ready', expected_delivery_date: TOMORROW },
  ],
  // No daily update at all for the In Progress task -> field_progress gate fails on staleness alone.
  dailyUpdates: [],
  expected: { overallStatus: 'blocked', failedGates: ['field_progress', 'dependency', 'subcontractor', 'materials'], aiShouldBeInvoked: true },
};

export const REPRESENTATIVE_PROJECTS: RepresentativeProject[] = [ganesh, miller, thompson, patel, nguyen];
