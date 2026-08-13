import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyStaleLeads } from '../staleLeadRules.ts';
import type { ReadinessLead } from '../types.ts';

const TODAY = '2026-08-13';

function lead(overrides: Partial<ReadinessLead>): ReadinessLead {
  return { id: 'l1', full_name: 'Jordan Reyes', company_name: 'Reyes Construction', status: 'new', created_at: '2026-08-12T00:00:00Z', ...overrides };
}

test('a "new" lead older than 3 days is stale', () => {
  const findings = identifyStaleLeads(TODAY, [lead({ created_at: '2026-08-09T00:00:00Z' })]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].daysSinceCreated, 4);
});

test('a "new" lead within 3 days is not stale', () => {
  const findings = identifyStaleLeads(TODAY, [lead({ created_at: '2026-08-12T00:00:00Z' })]);
  assert.equal(findings.length, 0);
});

test('a "contacted" lead uses the longer 7-day threshold', () => {
  assert.equal(identifyStaleLeads(TODAY, [lead({ status: 'contacted', created_at: '2026-08-08T00:00:00Z' })]).length, 0); // 5 days
  assert.equal(identifyStaleLeads(TODAY, [lead({ status: 'contacted', created_at: '2026-08-05T00:00:00Z' })]).length, 1); // 8 days
});

test('"qualified" and "declined" leads are never stale, regardless of age', () => {
  const findings = identifyStaleLeads(TODAY, [
    lead({ status: 'qualified', created_at: '2026-01-01T00:00:00Z' }),
    lead({ id: 'l2', status: 'declined', created_at: '2026-01-01T00:00:00Z' }),
  ]);
  assert.equal(findings.length, 0);
});
