import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../memoryRepository.ts';
import {
  isFeatureEnabled,
  isAiBrainEnabledForCompany,
  isCapabilityEnabled,
  AI_BRAIN_FLAG_KEYS,
} from '../featureFlags.ts';

test('an unseeded flag defaults to false (fail-closed), never true', async () => {
  const repo = new MemoryRepository();
  const enabled = await isFeatureEnabled(repo, 'ai_brain_enabled', 'company-1');
  assert.equal(enabled, false);
});

test('a global-default row applies to every company that has no override', async () => {
  const repo = new MemoryRepository();
  repo.seedFlag('ai_brain_audit', null, false);
  assert.equal(await isFeatureEnabled(repo, 'ai_brain_audit', 'company-1'), false);
  assert.equal(await isFeatureEnabled(repo, 'ai_brain_audit', 'company-2'), false);
});

test('a company-scoped override takes precedence over the global default', async () => {
  const repo = new MemoryRepository();
  repo.seedFlag('ai_brain_audit', null, false); // global off
  repo.seedFlag('ai_brain_audit', 'company-1', true); // company-1 opted in

  assert.equal(await isFeatureEnabled(repo, 'ai_brain_audit', 'company-1'), true);
  assert.equal(await isFeatureEnabled(repo, 'ai_brain_audit', 'company-2'), false);
});

test('isCapabilityEnabled requires BOTH the master switch and the specific flag', async () => {
  const repo = new MemoryRepository();
  repo.seedFlag('ai_brain_enabled', 'company-1', true);
  repo.seedFlag('ai_brain_workflow_engine', 'company-1', false);

  assert.equal(await isAiBrainEnabledForCompany(repo, 'company-1'), true);
  assert.equal(await isCapabilityEnabled(repo, 'ai_brain_workflow_engine', 'company-1'), false);

  repo.seedFlag('ai_brain_workflow_engine', 'company-1', true);
  assert.equal(await isCapabilityEnabled(repo, 'ai_brain_workflow_engine', 'company-1'), true);
});

test('the master switch off disables a capability even if its own flag is on (kill switch)', async () => {
  const repo = new MemoryRepository();
  repo.seedFlag('ai_brain_enabled', 'company-1', false);
  repo.seedFlag('ai_brain_workflow_engine', 'company-1', true);

  assert.equal(await isCapabilityEnabled(repo, 'ai_brain_workflow_engine', 'company-1'), false);
});

test('there are exactly seven flag keys, one per Phase 1 capability plus the master switch', () => {
  assert.equal(AI_BRAIN_FLAG_KEYS.length, 7);
  assert.ok(AI_BRAIN_FLAG_KEYS.includes('ai_brain_enabled'));
});
