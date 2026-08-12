import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../memoryRepository.ts';
import {
  FROZEN_AGENT_SEED,
  FROZEN_SOP_SEED,
  seedMemoryRegistry,
  getAgentOrThrow,
  getSopOrThrow,
  isFrozenAgentId,
} from '../registry.ts';
import { FROZEN_AGENT_IDS } from '../types.ts';

test('the registry contains exactly the six frozen agents, by stable id', () => {
  assert.equal(FROZEN_AGENT_SEED.length, 6);
  const ids = FROZEN_AGENT_SEED.map((a) => a.id).sort();
  assert.deepEqual(ids, [...FROZEN_AGENT_IDS].sort());
});

test('every agent field required by the Identity spec / Agent Registry section is present', () => {
  for (const agent of FROZEN_AGENT_SEED) {
    assert.ok(agent.displayName, `${agent.id} missing displayName`);
    assert.ok(agent.officialTitle, `${agent.id} missing officialTitle`);
    assert.ok(agent.businessDomain, `${agent.id} missing businessDomain`);
    assert.ok(agent.mission, `${agent.id} missing mission`);
    assert.ok(agent.responsibilities.length > 0, `${agent.id} missing responsibilities`);
    assert.ok(['L0', 'L1', 'L2', 'L3', 'L4'].includes(agent.authorityLevel));
    assert.ok(agent.escalationPolicy, `${agent.id} missing escalationPolicy`);
    assert.ok(agent.modelPolicy, `${agent.id} missing modelPolicy`);
    assert.equal(typeof agent.costBudget.monthlyUsd, 'number');
    assert.equal(typeof agent.costBudget.perCallUsd, 'number');
    assert.ok(['active', 'disabled'].includes(agent.status));
    assert.ok(agent.version);
  }
});

test('no agent starts at L4 — autonomy is earned per-SOP, never granted by default (Frozen §24)', () => {
  for (const agent of FROZEN_AGENT_SEED) {
    assert.notEqual(agent.authorityLevel, 'L4', `${agent.id} must not start at L4`);
  }
});

test('the Phase 1 task_delay_cascade_v1 SOP is CODE-tier, owned by project_operations, and active', () => {
  const sop = FROZEN_SOP_SEED.find((s) => s.id === 'task_delay_cascade_v1');
  assert.ok(sop);
  assert.equal(sop!.ownerAgentId, 'project_operations');
  assert.equal(sop!.executionMethod, 'CODE');
  assert.equal(sop!.status, 'active');
  assert.ok(sop!.triggerEventTypes.includes('task.delay_reported'));
});

test('the Phase 2 tomorrow_readiness_v1 SOP is CODE-tier, owned by project_operations, and active', () => {
  const sop = FROZEN_SOP_SEED.find((s) => s.id === 'tomorrow_readiness_v1');
  assert.ok(sop);
  assert.equal(sop!.ownerAgentId, 'project_operations');
  assert.equal(sop!.executionMethod, 'CODE');
  assert.equal(sop!.status, 'active');
  assert.ok(sop!.triggerEventTypes.includes('schedule.tomorrow_readiness_check'));
});

test('exactly two SOPs are registered so far — no undocumented SOP has been added', () => {
  assert.equal(FROZEN_SOP_SEED.length, 2);
});

test('getAgentOrThrow resolves a seeded agent and rejects an unknown id', async () => {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);

  const marcus = await getAgentOrThrow(repo, 'project_operations');
  assert.equal(marcus.displayName, 'Marcus');
  assert.equal(marcus.authorityLevel, 'L2');

  await assert.rejects(() => getAgentOrThrow(repo, 'nonexistent_agent' as never));
});

test('getAgentOrThrow rejects a disabled agent', async () => {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  repo.seedAgent({ ...FROZEN_AGENT_SEED[0], status: 'disabled' });

  await assert.rejects(() => getAgentOrThrow(repo, FROZEN_AGENT_SEED[0].id));
});

test('getSopOrThrow resolves the seeded SOP and rejects an unknown id', async () => {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);

  const sop = await getSopOrThrow(repo, 'task_delay_cascade_v1');
  assert.equal(sop.ownerAgentId, 'project_operations');

  await assert.rejects(() => getSopOrThrow(repo, 'nonexistent_sop'));
});

test('isFrozenAgentId correctly narrows valid vs invalid ids', () => {
  assert.equal(isFrozenAgentId('chief_of_staff'), true);
  assert.equal(isFrozenAgentId('avery'), false); // display name, not stable id — must be rejected
  assert.equal(isFrozenAgentId('random_agent'), false);
});
