import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatherVerifiedClientFacts, shouldDraftClientCommunication } from '../verifiedFacts.ts';
import type { ReadinessDecision, ReadinessDelayReason } from '../types.ts';

function decision(overrides: Partial<ReadinessDecision>): ReadinessDecision {
  return { id: 'd1', project_id: 'p1', decision_title: 'Countertop selection', needed_by_date: '2026-08-20', status: 'Needed', ...overrides };
}
function delay(overrides: Partial<ReadinessDelayReason>): ReadinessDelayReason {
  return { id: 'r1', project_id: 'p1', delay_category: 'Weather', client_safe_reason: 'Recent rain delayed the concrete pour', revised_projected_completion: '2026-09-01', client_visible: true, ...overrides };
}

test('an open decision produces a decision_reminder candidate with verbatim anchors', () => {
  const facts = gatherVerifiedClientFacts('p1', '2026-08-13', [decision({})], []);
  assert.equal(facts.candidates.length, 1);
  assert.equal(facts.candidates[0].occasion, 'decision_reminder');
  assert.deepEqual(facts.candidates[0].anchors, [
    { label: 'Decision', value: 'Countertop selection' },
    { label: 'Needed by', value: '2026-08-20' },
  ]);
});

test('Approved and Received decisions never produce a candidate', () => {
  const facts = gatherVerifiedClientFacts('p1', '2026-08-13', [decision({ status: 'Approved' }), decision({ id: 'd2', status: 'Received' })], []);
  assert.equal(facts.candidates.length, 0);
});

test('a decision with no needed_by_date still produces a candidate, anchored as "no date set"', () => {
  const facts = gatherVerifiedClientFacts('p1', '2026-08-13', [decision({ needed_by_date: null })], []);
  assert.equal(facts.candidates[0].anchors[1].value, 'no date set');
});

test('a client-visible delay with a safe reason produces a delay_update candidate', () => {
  const facts = gatherVerifiedClientFacts('p1', '2026-08-13', [], [delay({})]);
  assert.equal(facts.candidates.length, 1);
  assert.equal(facts.candidates[0].occasion, 'delay_update');
  assert.equal(facts.candidates[0].anchors[0].value, 'Recent rain delayed the concrete pour');
});

test('a delay NOT marked client_visible never produces a candidate, regardless of reason content', () => {
  const facts = gatherVerifiedClientFacts('p1', '2026-08-13', [], [delay({ client_visible: false })]);
  assert.equal(facts.candidates.length, 0);
});

test('a delay with no client_safe_reason set never produces a candidate (never falls back to internal_reason)', () => {
  const facts = gatherVerifiedClientFacts('p1', '2026-08-13', [], [delay({ client_safe_reason: '' })]);
  assert.equal(facts.candidates.length, 0);
});

test('candidates from a different project are excluded', () => {
  const facts = gatherVerifiedClientFacts('p1', '2026-08-13', [decision({ project_id: 'p2' })], [delay({ project_id: 'p2' })]);
  assert.equal(facts.candidates.length, 0);
});

test('shouldDraftClientCommunication: false when nothing open, true when something is', () => {
  assert.equal(shouldDraftClientCommunication({ projectId: 'p1', asOfDate: '2026-08-13', candidates: [] }), false);
  const facts = gatherVerifiedClientFacts('p1', '2026-08-13', [decision({})], []);
  assert.equal(shouldDraftClientCommunication(facts), true);
});
