// Project Ops (Marcus / project_operations) domain types — Phase 2.
//
// Minimal row shapes needed for readiness gating, kept intentionally
// narrower than the full DB interfaces in src/lib/supabase.ts (only the
// fields the deterministic gates actually read), so fixtures and tests stay
// small and the contract is explicit about what this agent looks at.

export type TaskStatus =
  | 'Draft' | 'Not Started' | 'Needs Review' | 'Open' | 'Assigned' | 'In Progress'
  | 'Blocked' | 'Ready for Review' | 'Completed' | 'Closed' | 'Cancelled';

export interface ReadinessTask {
  id: string;
  project_id: string;
  task_name: string;
  status: TaskStatus;
  planned_start_date: string | null;
  projected_start_date: string | null;
  dependency_task_id: string | null;
  schedule_locked: boolean;
  blocked_reason: string;
}

export type ConfirmationStatus = 'Pending' | 'Confirmed' | 'Need Reschedule' | 'Cannot Attend' | 'Need More Info';

export interface ReadinessCrewConfirmation {
  id: string;
  project_id: string;
  task_id: string | null;
  scheduled_date: string;
  confirmation_status: ConfirmationStatus;
  crew_available: boolean;
  start_time_confirmed: boolean;
  site_access_confirmed: boolean;
}

export type MaterialReadyStatus =
  | 'Ready' | 'Not Ready' | 'Partially Ready' | 'Pending Delivery'
  | 'Delayed' | 'Needs Confirmation' | 'Issue Found';

export interface ReadinessMaterial {
  id: string;
  project_id: string;
  related_task_id: string | null;
  material_name: string;
  material_ready_status: MaterialReadyStatus;
  expected_delivery_date: string | null;
}

export interface ReadinessDailyUpdate {
  id: string;
  project_id: string;
  task_id: string | null;
  update_date: string;
  current_status: string;
  blockers: string;
  delay_reason: string;
  delay_days: number;
  materials_pending: string;
  weather_issue: string;
}

export type GateStatus = 'ready' | 'not_ready';

export interface GateResult {
  gate: 'field_progress' | 'dependency' | 'subcontractor' | 'materials';
  status: GateStatus;
  /** Deterministic, human-readable facts — never AI-generated. */
  findings: string[];
}

export type OverallReadinessStatus = 'ready' | 'at_risk' | 'blocked';

/** The purely deterministic result — computed once, never touched by AI. */
export interface DeterministicReadinessResult {
  projectId: string;
  asOfDate: string;
  gates: GateResult[];
  overallStatus: OverallReadinessStatus;
}

export interface RiskInterpretation {
  /** True only when there was ambiguous free text worth interpreting. */
  invoked: boolean;
  category: 'none' | 'weather' | 'material_delay' | 'access_issue' | 'labor_issue' | 'other';
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  sourceText: string[];
}

/** The final, human-reviewable assessment: deterministic verdict + optional AI explanation layered on top, never replacing it. */
export interface ProjectReadinessAssessment {
  deterministic: DeterministicReadinessResult;
  interpretation: RiskInterpretation;
  /** Always equal to deterministic.overallStatus — AI is never allowed to change this. Kept as a separate field so a workflow-run verification step can catch a violation instead of trusting a convention. */
  finalStatus: OverallReadinessStatus;
}
