import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicFollowUpDraftClient, validateFollowUpGroundedness } from '../followUpDraftClient.ts';
import type { StaleLeadFinding } from '../types.ts';

function finding(overrides: Partial<StaleLeadFinding> = {}): StaleLeadFinding {
  return { leadId: 'l1', fullName: 'Jordan Reyes', companyName: 'Reyes Construction', status: 'new', daysSinceCreated: 5, ...overrides };
}

test('the deterministic client always names the lead — always passes groundedness', async () => {
  const client = new DeterministicFollowUpDraftClient();
  const f = finding();
  const draft = { leadId: f.leadId, ...(await client.draft(f)) };
  assert.equal(validateFollowUpGroundedness(draft, f).grounded, true);
});

test('groundedness catches a draft that never mentions the lead by name', () => {
  const f = finding();
  const draft = { leadId: f.leadId, subject: 'Checking in', body: 'Just wanted to follow up on our last conversation.' };
  assert.equal(validateFollowUpGroundedness(draft, f).grounded, false);
});
