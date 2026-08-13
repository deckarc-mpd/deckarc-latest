// Compliance (Clara / compliance) domain types — Phase 7.
//
// Row shapes narrowed to real columns (confirmed against the actual
// migrations, not invented): permits.permit_expiration_date/
// revision_requested/correction_notes, inspections.correction_required/
// reinspection_required, and user_profiles.license_expiration/
// coi_expiration/insurance_status for subcontractor/GC compliance
// documents. No dedicated project_inspection_requirements or W-9 table
// exists yet — this slice tracks what's real (COI expiration, license
// expiration) and does not invent schema for what isn't.

export interface ReadinessPermit {
  id: string;
  project_id: string;
  permit_type: string;
  permit_status: string;
  permit_expiration_date: string | null;
  revision_requested: boolean;
  correction_notes: string;
}

export interface ReadinessInspection {
  id: string;
  project_id: string;
  inspection_type: string;
  scheduled_date: string | null;
  result: string;
  correction_required: boolean;
  correction_notes: string;
  reinspection_required: boolean;
  reinspection_scheduled_date: string | null;
}

/** One subcontractor/GC's compliance documentation, sourced from user_profiles. */
export interface ReadinessComplianceDocument {
  id: string;
  full_name: string;
  license_expiration: string | null;
  coi_expiration: string | null;
  insurance_status: string;
}

export type ComplianceGateName = 'permit_status' | 'inspection_readiness' | 'coi_w9';
export type GateStatus = 'ready' | 'not_ready';

export interface ComplianceGateResult {
  gate: ComplianceGateName;
  status: GateStatus;
  findings: string[];
}

export type ComplianceOverallStatus = 'ready' | 'at_risk' | 'blocked';

export interface DeterministicComplianceResult {
  projectId: string;
  asOfDate: string;
  gates: ComplianceGateResult[];
  overallStatus: ComplianceOverallStatus;
}

export type ComplianceFindingCategory = 'permit_issue' | 'inspection_correction' | 'coi_expiry' | 'other' | 'none';
export type ComplianceFindingSeverity = 'low' | 'medium' | 'high';

export interface ComplianceInterpretation {
  invoked: boolean;
  category: ComplianceFindingCategory;
  severity: ComplianceFindingSeverity;
  explanation: string;
  sourceText: string[];
}

export interface ProjectComplianceAssessment {
  deterministic: DeterministicComplianceResult;
  interpretation: ComplianceInterpretation;
  finalStatus: ComplianceOverallStatus;
}
