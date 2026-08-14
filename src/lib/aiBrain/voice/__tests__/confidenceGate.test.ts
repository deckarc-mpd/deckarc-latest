import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiresReadBackConfirmation } from '../confidenceGate.ts';
import type { ClassifiedIntent } from '../types.ts';

function intent(overrides: Partial<ClassifiedIntent> = {}): ClassifiedIntent {
  return {
    kind: 'query_tomorrow_readiness', agentId: null, isConsequential: false,
    resolvedProjectId: 'proj-1', resolvedTaskId: null, delayDays: null,
    decision: null, reasonText: '', ...overrides,
  };
}

test('a non-consequential query only needs the standard (lower) threshold', () => {
  assert.equal(requiresReadBackConfirmation({ text: 'x', confidence: 0.65 }, intent({ isConsequential: false })), false);
  assert.equal(requiresReadBackConfirmation({ text: 'x', confidence: 0.5 }, intent({ isConsequential: false })), true);
});

test('a consequential action (delay report, approval) needs the stricter threshold', () => {
  assert.equal(requiresReadBackConfirmation({ text: 'x', confidence: 0.7 }, intent({ isConsequential: true })), true, '0.7 clears the standard threshold but not the stricter one');
  assert.equal(requiresReadBackConfirmation({ text: 'x', confidence: 0.9 }, intent({ isConsequential: true })), false);
});
