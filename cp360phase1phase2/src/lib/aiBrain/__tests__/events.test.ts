import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../audit.ts';
import {
  emitUiEvent,
  emitScheduleEvent,
  emitVoiceEvent,
  emitEmailEvent,
  emitApiEvent,
  emitSystemEvent,
} from '../events.ts';

function ctx() {
  return { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
}

test('every surface-specific emitter funnels through the same repository and shape', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);

  const ui = await emitUiEvent(audit, ctx(), 'user-1', 'task.delay_reported', { taskId: 't1' });
  const schedule = await emitScheduleEvent(audit, ctx(), 'sweep.tomorrow_readiness', { date: '2026-08-13' });
  const voice = await emitVoiceEvent(audit, ctx(), 'user-1', 'task.delay_reported', { taskId: 't2' });
  const email = await emitEmailEvent(audit, ctx(), 'inbound.email_normalized', { threadId: 'th1' });
  const api = await emitApiEvent(audit, ctx(), 'partner-app', 'task.delay_reported', { taskId: 't3' });
  const system = await emitSystemEvent(audit, ctx(), 'workflow.chained', { fromWorkflowRunId: 'wfr_1' });

  // Every event landed in the SAME repository — one abstraction, not six.
  assert.equal(repo.events.length, 6);

  // Source/actor differ per surface, as designed...
  assert.equal(ui.source, 'ui');
  assert.equal(ui.actor.type, 'human');
  assert.equal(schedule.source, 'schedule');
  assert.equal(schedule.actor.type, 'schedule');
  assert.equal(voice.source, 'voice');
  assert.equal(voice.actor.type, 'human');
  assert.equal(email.source, 'email');
  assert.equal(email.actor.type, 'system');
  assert.equal(api.source, 'api');
  assert.equal(api.actor.type, 'human');
  assert.equal(system.source, 'system');
  assert.equal(system.actor.type, 'system');

  // ...but the envelope shape (which fields exist) is identical for all six.
  const shapes = [ui, schedule, voice, email, api, system].map((e) => Object.keys(e).sort());
  const first = shapes[0];
  for (const shape of shapes) assert.deepEqual(shape, first);
});

test('two events sharing a correlation id are queryable as one causal chain', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const c = ctx();

  const reported = await emitUiEvent(audit, c, 'user-1', 'task.delay_reported', { taskId: 't1' });
  // A downstream SOP completing triggers a chained system event under the SAME correlation id.
  const chained = await emitSystemEvent(audit, c, 'workflow.chained', { fromEventId: reported.id });

  assert.equal(reported.correlationId, chained.correlationId);
  const related = repo.events.filter((e) => e.correlationId === c.correlationId);
  assert.equal(related.length, 2);
});

test('emitting an event never throws even if nothing is listening for its type', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  // No SOP registered for 'nonexistent.event_type' in this repo — emission
  // must still succeed; deciding what (if anything) reacts is the workflow
  // engine's job, not the event layer's.
  const event = await emitScheduleEvent(audit, ctx(), 'nonexistent.event_type', {});
  assert.ok(event.id);
});
