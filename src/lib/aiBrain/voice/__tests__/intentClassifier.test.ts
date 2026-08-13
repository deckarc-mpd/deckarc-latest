import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyVoiceIntent } from '../intentClassifier.ts';
import type { VoiceEntityDirectory } from '../types.ts';

const DIRECTORY: VoiceEntityDirectory = {
  projects: [{ id: 'proj-thompson', name: 'Thompson Deck Build' }],
  tasks: [{ id: 'task-drywall', name: 'Drywall Hang', projectId: 'proj-thompson' }],
};

test('classifies a readiness query as query_tomorrow_readiness, not consequential', () => {
  const intent = classifyVoiceIntent("What's the readiness status for the Thompson Deck Build tomorrow?", DIRECTORY);
  assert.equal(intent.kind, 'query_tomorrow_readiness');
  assert.equal(intent.isConsequential, false);
  assert.equal(intent.resolvedProjectId, 'proj-thompson');
});

test('classifies a delay report as report_task_delay, consequential, with days and task resolved', () => {
  const intent = classifyVoiceIntent('Push back the Drywall Hang task by 2 days, supplier delay', DIRECTORY);
  assert.equal(intent.kind, 'report_task_delay');
  assert.equal(intent.isConsequential, true);
  assert.equal(intent.resolvedTaskId, 'task-drywall');
  assert.equal(intent.resolvedProjectId, 'proj-thompson');
  assert.equal(intent.delayDays, 2);
});

test('classifies an approval as decide_pending_approval with decision=approved, consequential', () => {
  const intent = classifyVoiceIntent('Marcus, approve that', DIRECTORY);
  assert.equal(intent.kind, 'decide_pending_approval');
  assert.equal(intent.isConsequential, true);
  assert.equal(intent.decision, 'approved');
  assert.equal(intent.agentId, 'project_operations');
});

test('classifies a rejection as decide_pending_approval with decision=rejected', () => {
  const intent = classifyVoiceIntent('No, cancel that', DIRECTORY);
  assert.equal(intent.kind, 'decide_pending_approval');
  assert.equal(intent.decision, 'rejected');
});

test('approval keywords take priority over readiness/delay keywords when both are present', () => {
  const intent = classifyVoiceIntent('Yes, approve the delay for the Thompson project', DIRECTORY);
  assert.equal(intent.kind, 'decide_pending_approval');
});

test('unrecognized speech resolves entities if present but is never actionable', () => {
  const intent = classifyVoiceIntent('Tell me a joke about the Thompson Deck Build', DIRECTORY);
  assert.equal(intent.kind, 'unrecognized');
  assert.equal(intent.resolvedProjectId, 'proj-thompson');
});
