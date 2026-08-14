import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPermitStatusGate,
  checkInspectionReadinessGate,
  checkCoiW9Gate,
  assessComplianceReadiness,
} from '../readinessGates.ts';
import type { ReadinessPermit, ReadinessInspection, ReadinessComplianceDocument } from '../types.ts';

const TODAY = '2026-08-13';

function permit(overrides: Partial<ReadinessPermit>): ReadinessPermit {
  return { id: 'p1', project_id: 'proj-1', permit_type: 'Building', permit_status: 'Approved', permit_expiration_date: null, revision_requested: false, correction_notes: '', ...overrides };
}
function inspection(overrides: Partial<ReadinessInspection>): ReadinessInspection {
  return { id: 'i1', project_id: 'proj-1', inspection_type: 'Framing', scheduled_date: null, result: 'Passed', correction_required: false, correction_notes: '', reinspection_required: false, reinspection_scheduled_date: null, ...overrides };
}
function doc(overrides: Partial<ReadinessComplianceDocument>): ReadinessComplianceDocument {
  return { id: 'u1', full_name: 'Ace Plumbing', license_expiration: null, coi_expiration: null, insurance_status: 'Current', ...overrides };
}

test('permit gate: an approved permit with no expiry issue is ready', () => {
  assert.equal(checkPermitStatusGate(TODAY, [permit({})]).status, 'ready');
});

test('permit gate: a rejected/correction-requested permit is not ready, with a finding', () => {
  const result = checkPermitStatusGate(TODAY, [permit({ permit_status: 'Correction Requested', correction_notes: 'Missing site plan' })]);
  assert.equal(result.status, 'not_ready');
  assert.match(result.findings[0], /Missing site plan/);
});

test('permit gate: a permit expiring within the warning window is not ready', () => {
  const result = checkPermitStatusGate(TODAY, [permit({ permit_expiration_date: '2026-08-20' })]);
  assert.equal(result.status, 'not_ready');
  assert.match(result.findings[0], /expires/);
});

test('permit gate: an already-expired permit is worded as "expired", not "expires"', () => {
  const result = checkPermitStatusGate(TODAY, [permit({ permit_expiration_date: '2026-08-01' })]);
  assert.match(result.findings[0], /expired/);
});

test('permit gate: a permit expiring well beyond the window is ready', () => {
  assert.equal(checkPermitStatusGate(TODAY, [permit({ permit_expiration_date: '2026-12-01' })]).status, 'ready');
});

test('inspection gate: a failed inspection is not ready', () => {
  const result = checkInspectionReadinessGate([inspection({ result: 'Failed', correction_notes: 'Missing GFCI outlet' })]);
  assert.equal(result.status, 'not_ready');
  assert.match(result.findings[0], /Missing GFCI outlet/);
});

test('inspection gate: correction required with a reinspection already scheduled is ready', () => {
  const result = checkInspectionReadinessGate([inspection({ correction_required: true, reinspection_scheduled_date: '2026-08-18' })]);
  assert.equal(result.status, 'ready');
});

test('inspection gate: correction required with NO reinspection scheduled is not ready', () => {
  const result = checkInspectionReadinessGate([inspection({ correction_required: true, reinspection_scheduled_date: null })]);
  assert.equal(result.status, 'not_ready');
});

test('coi/w9 gate: current insurance and no near-term expiry is ready', () => {
  assert.equal(checkCoiW9Gate(TODAY, [doc({})]).status, 'ready');
});

test('coi/w9 gate: non-Current insurance status is not ready', () => {
  const result = checkCoiW9Gate(TODAY, [doc({ insurance_status: 'Expired' })]);
  assert.equal(result.status, 'not_ready');
  assert.match(result.findings[0], /Expired/);
});

test('coi/w9 gate: a COI expiring within the warning window is not ready', () => {
  const result = checkCoiW9Gate(TODAY, [doc({ coi_expiration: '2026-08-15' })]);
  assert.equal(result.status, 'not_ready');
});

test('assessComplianceReadiness: a permit or inspection problem rolls up to blocked', () => {
  const result = assessComplianceReadiness('proj-1', TODAY, [permit({ permit_status: 'Rejected' })], [], []);
  assert.equal(result.overallStatus, 'blocked');
});

test('assessComplianceReadiness: only a COI/license issue rolls up to at_risk, not blocked', () => {
  const result = assessComplianceReadiness('proj-1', TODAY, [], [], [doc({ insurance_status: 'Expired' })]);
  assert.equal(result.overallStatus, 'at_risk');
});

test('assessComplianceReadiness: everything clean rolls up to ready', () => {
  const result = assessComplianceReadiness('proj-1', TODAY, [permit({})], [inspection({})], [doc({})]);
  assert.equal(result.overallStatus, 'ready');
});

test('assessComplianceReadiness: rows from a different project are excluded', () => {
  const result = assessComplianceReadiness('proj-1', TODAY, [permit({ project_id: 'proj-2', permit_status: 'Rejected' })], [], []);
  assert.equal(result.overallStatus, 'ready');
});
