import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpokenAgentName } from '../agentNameResolver.ts';

test('resolves a spoken display name to its stable agent id', () => {
  assert.equal(resolveSpokenAgentName('Marcus, approve the trade issue'), 'project_operations');
  assert.equal(resolveSpokenAgentName('ask Natalie to draft an update'), 'customer_success');
  assert.equal(resolveSpokenAgentName('Avery, what needs my attention today'), 'chief_of_staff');
});

test('is case-insensitive', () => {
  assert.equal(resolveSpokenAgentName('MARCUS please check tomorrow'), 'project_operations');
});

test('returns null when no known display name is mentioned', () => {
  assert.equal(resolveSpokenAgentName('what is the status of the Thompson project'), null);
});
