import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessApStatus } from '../apWorkflow.ts';
import type { ReadinessVendorBill } from '../types.ts';

const TODAY = '2026-08-13';

function bill(overrides: Partial<ReadinessVendorBill>): ReadinessVendorBill {
  return { id: 'b1', project_id: 'proj-1', vendor_name: 'Ace Plumbing', due_date: TODAY, amount: 5000, status: 'Unpaid', dispute_notes: '', ...overrides };
}

test('an overdue unpaid bill is surfaced with reason "overdue"', () => {
  const findings = assessApStatus(TODAY, [bill({ due_date: '2026-08-01' })]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, 'overdue');
});

test('a disputed bill is surfaced with reason "disputed" regardless of due date', () => {
  const findings = assessApStatus(TODAY, [bill({ status: 'Disputed', due_date: '2026-09-01', dispute_notes: 'Quantity billed does not match delivery' })]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, 'disputed');
});

test('a paid bill is never surfaced', () => {
  const findings = assessApStatus(TODAY, [bill({ status: 'Paid', due_date: '2026-08-01' })]);
  assert.equal(findings.length, 0);
});

test('an unpaid bill not yet due is never surfaced', () => {
  const findings = assessApStatus(TODAY, [bill({ due_date: '2026-09-01' })]);
  assert.equal(findings.length, 0);
});

test('this module never executes or schedules a payment — it has no write function at all', async () => {
  const moduleExports = Object.keys(await import('../apWorkflow.ts'));
  assert.deepEqual(moduleExports, ['assessApStatus']);
});
