// Deterministic compliance gates (CODE tier, Frozen §4/§7/§11). Permit
// expiry, inspection correction/reinspection tracking, and COI/license
// expiry are all decided here, from real CP360 columns, before any AI
// involvement — exactly the "deterministic rules/deadlines first" ordering
// the phase instructions require.

import type {
  ReadinessPermit,
  ReadinessInspection,
  ReadinessComplianceDocument,
  ComplianceGateResult,
  DeterministicComplianceResult,
  ComplianceOverallStatus,
} from './types.ts';

/** Permits/COI/licenses expiring within this many days count as a live risk, not just an already-expired one. */
export const EXPIRY_WARNING_DAYS = 14;

const BLOCKING_PERMIT_STATUSES = new Set(['Rejected', 'Correction Requested', 'Revision Needed', 'Expired']);

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export function checkPermitStatusGate(asOfDate: string, permits: ReadinessPermit[]): ComplianceGateResult {
  const findings: string[] = [];
  const warningCutoff = addDays(asOfDate, EXPIRY_WARNING_DAYS);

  for (const p of permits) {
    if (BLOCKING_PERMIT_STATUSES.has(p.permit_status)) {
      findings.push(`${p.permit_type || 'Permit'} is ${p.permit_status}${p.correction_notes ? `: ${p.correction_notes}` : ''}`);
      continue;
    }
    if (p.revision_requested) {
      findings.push(`${p.permit_type || 'Permit'} has a revision requested${p.correction_notes ? `: ${p.correction_notes}` : ''}`);
      continue;
    }
    if (p.permit_expiration_date && p.permit_expiration_date <= warningCutoff) {
      const already = p.permit_expiration_date < asOfDate;
      findings.push(`${p.permit_type || 'Permit'} ${already ? 'expired' : 'expires'} ${p.permit_expiration_date}`);
    }
  }

  return { gate: 'permit_status', status: findings.length > 0 ? 'not_ready' : 'ready', findings };
}

export function checkInspectionReadinessGate(inspections: ReadinessInspection[]): ComplianceGateResult {
  const findings: string[] = [];

  for (const i of inspections) {
    if (i.result === 'Failed') {
      findings.push(`${i.inspection_type || 'Inspection'} failed${i.correction_notes ? `: ${i.correction_notes}` : ''}`);
      continue;
    }
    if (i.correction_required && !i.reinspection_scheduled_date) {
      findings.push(`${i.inspection_type || 'Inspection'} needs a correction, no reinspection scheduled yet${i.correction_notes ? `: ${i.correction_notes}` : ''}`);
    }
  }

  return { gate: 'inspection_readiness', status: findings.length > 0 ? 'not_ready' : 'ready', findings };
}

export function checkCoiW9Gate(asOfDate: string, documents: ReadinessComplianceDocument[]): ComplianceGateResult {
  const findings: string[] = [];
  const warningCutoff = addDays(asOfDate, EXPIRY_WARNING_DAYS);

  for (const doc of documents) {
    if (doc.insurance_status !== 'Current') {
      findings.push(`${doc.full_name}: insurance status is ${doc.insurance_status}`);
    }
    if (doc.coi_expiration && doc.coi_expiration <= warningCutoff) {
      const already = doc.coi_expiration < asOfDate;
      findings.push(`${doc.full_name}: certificate of insurance ${already ? 'expired' : 'expires'} ${doc.coi_expiration}`);
    }
    if (doc.license_expiration && doc.license_expiration <= warningCutoff) {
      const already = doc.license_expiration < asOfDate;
      findings.push(`${doc.full_name}: license ${already ? 'expired' : 'expires'} ${doc.license_expiration}`);
    }
  }

  return { gate: 'coi_w9', status: findings.length > 0 ? 'not_ready' : 'ready', findings };
}

/**
 * Overall rollup: a live permit or inspection problem actively blocks
 * work/scheduling next steps ('blocked'); a COI/license issue is a real
 * compliance risk but doesn't itself stop tomorrow's work ('at_risk') —
 * mirrors tomorrow_readiness_v1's blocked-vs-at_risk distinction.
 */
export function assessComplianceReadiness(
  projectId: string,
  asOfDate: string,
  permits: ReadinessPermit[],
  inspections: ReadinessInspection[],
  documents: ReadinessComplianceDocument[]
): DeterministicComplianceResult {
  const permitGate = checkPermitStatusGate(asOfDate, permits.filter((p) => p.project_id === projectId));
  const inspectionGate = checkInspectionReadinessGate(inspections.filter((i) => i.project_id === projectId));
  const coiGate = checkCoiW9Gate(asOfDate, documents);

  const gates = [permitGate, inspectionGate, coiGate];

  let overallStatus: ComplianceOverallStatus = 'ready';
  if (permitGate.status === 'not_ready' || inspectionGate.status === 'not_ready') {
    overallStatus = 'blocked';
  } else if (coiGate.status === 'not_ready') {
    overallStatus = 'at_risk';
  }

  return { projectId, asOfDate, gates, overallStatus };
}
