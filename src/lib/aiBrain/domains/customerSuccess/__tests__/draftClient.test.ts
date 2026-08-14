import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicDraftClient, validateDraftGroundedness } from '../draftClient.ts';
import type { ClientCommunicationCandidate } from '../types.ts';

function decisionCandidate(overrides: Partial<ClientCommunicationCandidate> = {}): ClientCommunicationCandidate {
  return {
    occasion: 'decision_reminder', sourceId: 'd1', projectId: 'p1',
    anchors: [{ label: 'Decision', value: 'Countertop selection' }, { label: 'Needed by', value: '2026-08-20' }],
    ...overrides,
  };
}
function delayCandidate(overrides: Partial<ClientCommunicationCandidate> = {}): ClientCommunicationCandidate {
  return {
    occasion: 'delay_update', sourceId: 'r1', projectId: 'p1',
    anchors: [{ label: 'Reason', value: 'Recent rain delayed the concrete pour' }, { label: 'Revised completion', value: '2026-09-01' }],
    ...overrides,
  };
}

test('DeterministicDraftClient produces a decision reminder mentioning both anchors verbatim', async () => {
  const client = new DeterministicDraftClient();
  const draft = await client.draft(decisionCandidate());
  assert.match(draft.subject, /Countertop selection/);
  assert.match(draft.body, /Countertop selection/);
  assert.match(draft.body, /2026-08-20/);
});

test('DeterministicDraftClient produces a delay update mentioning both anchors verbatim', async () => {
  const client = new DeterministicDraftClient();
  const draft = await client.draft(delayCandidate());
  assert.match(draft.body, /Recent rain delayed the concrete pour/);
  assert.match(draft.body, /2026-09-01/);
});

test('DeterministicDraftClient never claims a specific date when none is known', async () => {
  const client = new DeterministicDraftClient();
  const draft = await client.draft(delayCandidate({ anchors: [{ label: 'Reason', value: 'Permit office backlog' }, { label: 'Revised completion', value: 'to be determined' }] }));
  assert.doesNotMatch(draft.body, /\d{4}-\d{2}-\d{2}/); // no fabricated date string
  assert.match(draft.body, /confirm a new timeline/);
});

test('validateDraftGroundedness: the deterministic client always passes (it can only echo anchors)', async () => {
  const client = new DeterministicDraftClient();
  for (const candidate of [decisionCandidate(), delayCandidate()]) {
    const { subject, body } = await client.draft(candidate);
    const result = validateDraftGroundedness({ occasion: candidate.occasion, sourceId: candidate.sourceId, subject, body }, candidate);
    assert.equal(result.grounded, true, `expected grounded draft for ${candidate.occasion}`);
  }
});

test('validateDraftGroundedness: catches a draft that omits a required fact', () => {
  const candidate = decisionCandidate();
  const draft = { occasion: candidate.occasion, sourceId: candidate.sourceId, subject: 'Please respond soon', body: 'We need your input on the kitchen finishes.' };
  const result = validateDraftGroundedness(draft, candidate);
  assert.equal(result.grounded, false);
  assert.deepEqual(result.missingAnchors.sort(), ['Decision', 'Needed by']);
});

test('validateDraftGroundedness: a placeholder anchor value ("no date set"/"to be determined") is never required verbatim', () => {
  const candidate = decisionCandidate({ anchors: [{ label: 'Decision', value: 'Tile selection' }, { label: 'Needed by', value: 'no date set' }] });
  const draft = { occasion: candidate.occasion, sourceId: candidate.sourceId, subject: 'Action needed: Tile selection', body: 'We need your input on "Tile selection" to keep things moving.' };
  assert.equal(validateDraftGroundedness(draft, candidate).grounded, true);
});
