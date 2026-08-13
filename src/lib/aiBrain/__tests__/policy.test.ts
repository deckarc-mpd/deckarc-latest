import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeExecutionMethod, evaluateAuthority, authorityAtLeast } from '../policy.ts';

test('routeExecutionMethod: deterministic code always wins, regardless of the other flags', () => {
  assert.equal(
    routeExecutionMethod({ canDeterministicCodeHandle: true, requiresInterpretation: true, exceedsAiPermission: true }),
    'CODE'
  );
});

test('routeExecutionMethod: no code, no interpretation needed -> still CODE (Frozen WORKFLOW branch, no LLM)', () => {
  assert.equal(
    routeExecutionMethod({ canDeterministicCodeHandle: false, requiresInterpretation: false, exceedsAiPermission: false }),
    'CODE'
  );
});

test('routeExecutionMethod: interpretation needed, within AI permission -> AI', () => {
  assert.equal(
    routeExecutionMethod({ canDeterministicCodeHandle: false, requiresInterpretation: true, exceedsAiPermission: false }),
    'AI'
  );
});

test('routeExecutionMethod: interpretation needed, exceeds AI permission -> HUMAN', () => {
  assert.equal(
    routeExecutionMethod({ canDeterministicCodeHandle: false, requiresInterpretation: true, exceedsAiPermission: true }),
    'HUMAN'
  );
});

test('evaluateAuthority: L0 is always denied, even for reads', () => {
  assert.equal(evaluateAuthority({ agentAuthorityLevel: 'L0', actionKind: 'read' }), 'denied');
  assert.equal(evaluateAuthority({ agentAuthorityLevel: 'L0', actionKind: 'write' }), 'denied');
});

test('evaluateAuthority: L1 can read but never write', () => {
  assert.equal(evaluateAuthority({ agentAuthorityLevel: 'L1', actionKind: 'read' }), 'execute');
  assert.equal(evaluateAuthority({ agentAuthorityLevel: 'L1', actionKind: 'write' }), 'denied');
});

test('evaluateAuthority: L2 write always requires approval (propose, human approves)', () => {
  assert.equal(evaluateAuthority({ agentAuthorityLevel: 'L2', actionKind: 'write' }), 'require_approval');
  assert.equal(
    evaluateAuthority({ agentAuthorityLevel: 'L2', actionKind: 'write', consequential: true }),
    'require_approval'
  );
});

test('evaluateAuthority: L3 write executes with confirmation unless consequential, which forces approval', () => {
  assert.equal(evaluateAuthority({ agentAuthorityLevel: 'L3', actionKind: 'write' }), 'execute_with_confirmation');
  assert.equal(
    evaluateAuthority({ agentAuthorityLevel: 'L3', actionKind: 'write', consequential: true }),
    'require_approval'
  );
});

test('evaluateAuthority: L4 write executes outright unless consequential, which still forces approval', () => {
  assert.equal(evaluateAuthority({ agentAuthorityLevel: 'L4', actionKind: 'write' }), 'execute');
  assert.equal(
    evaluateAuthority({ agentAuthorityLevel: 'L4', actionKind: 'write', consequential: true }),
    'require_approval'
  );
});

test('evaluateAuthority: any granted level can read without approval', () => {
  for (const level of ['L1', 'L2', 'L3', 'L4'] as const) {
    assert.equal(evaluateAuthority({ agentAuthorityLevel: level, actionKind: 'read' }), 'execute');
  }
});

test('authorityAtLeast orders levels correctly', () => {
  assert.equal(authorityAtLeast('L2', 'L1'), true);
  assert.equal(authorityAtLeast('L1', 'L2'), false);
  assert.equal(authorityAtLeast('L2', 'L2'), true);
  assert.equal(authorityAtLeast('L0', 'L1'), false);
  assert.equal(authorityAtLeast('L4', 'L0'), true);
});
