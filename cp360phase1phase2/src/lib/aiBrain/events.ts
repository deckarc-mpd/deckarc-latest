// CP360 AI Operations Brain — the one shared event entrypoint.
//
// Frozen Architecture v4 §9/§23.4: "Events / Schedules / Voice / Gmail /
// Calendar / Drive / Human / API" all funnel into ONE abstraction, never a
// per-surface or per-department mechanism. This module is that funnel:
// every trigger surface (UI, scheduler, voice, email, API, system) calls the
// same `emitEvent()` underneath, through source-specific convenience
// wrappers that only differ in what shape of actor/source they stamp — never
// in how the event is recorded or audited.
//
// This is deliberately the smallest possible layer: it does not decide what
// happens next (that's the workflow engine, Slice 4) — it only produces a
// correctly-shaped, audited EventEnvelope that a workflow engine can react
// to. Emitting an event never throws for "no SOP is registered for this
// event type" — that decision belongs to whatever is listening, not to the
// event abstraction itself.

import type { AuditLog, AuditContext } from './audit.ts';
import type { ActorRef, EventEnvelope } from './types.ts';

export interface EmitOptions {
  payloadVersion?: string;
}

/** The single function every surface-specific helper below calls. */
export async function emitEvent(
  audit: AuditLog,
  ctx: AuditContext,
  source: EventEnvelope['source'],
  actor: ActorRef,
  eventType: string,
  payload: Record<string, unknown>,
  options: EmitOptions = {}
): Promise<EventEnvelope> {
  return audit.event(ctx, source, actor, eventType, payload, options.payloadVersion ?? '1.0');
}

/** A user action in the CP360 UI (clicking a button, submitting a form). */
export function emitUiEvent(
  audit: AuditLog,
  ctx: AuditContext,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<EventEnvelope> {
  return emitEvent(audit, ctx, 'ui', { type: 'human', id: userId }, eventType, payload);
}

/** A scheduled sweep tick (Phase 4's cron/pg_cron triggers land here). */
export function emitScheduleEvent(
  audit: AuditLog,
  ctx: AuditContext,
  eventType: string,
  payload: Record<string, unknown>
): Promise<EventEnvelope> {
  return emitEvent(audit, ctx, 'schedule', { type: 'schedule', id: 'scheduler' }, eventType, payload);
}

/** A voice command, after the (future) authenticated-session check resolves a real user. */
export function emitVoiceEvent(
  audit: AuditLog,
  ctx: AuditContext,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<EventEnvelope> {
  return emitEvent(audit, ctx, 'voice', { type: 'human', id: userId }, eventType, payload);
}

/** A normalized inbound-email event from the (future) Integration Gateway. Never a raw Gmail payload — see ADR-CP360-AI-001. */
export function emitEmailEvent(
  audit: AuditLog,
  ctx: AuditContext,
  eventType: string,
  payload: Record<string, unknown>
): Promise<EventEnvelope> {
  return emitEvent(audit, ctx, 'email', { type: 'system', id: 'integration_gateway' }, eventType, payload);
}

/** An external API call (future public/partner API surface). */
export function emitApiEvent(
  audit: AuditLog,
  ctx: AuditContext,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<EventEnvelope> {
  return emitEvent(audit, ctx, 'api', { type: 'human', id: actorId }, eventType, payload);
}

/** An internally-generated event (e.g. one SOP's completion triggering another). */
export function emitSystemEvent(
  audit: AuditLog,
  ctx: AuditContext,
  eventType: string,
  payload: Record<string, unknown>
): Promise<EventEnvelope> {
  return emitEvent(audit, ctx, 'system', { type: 'system', id: 'system' }, eventType, payload);
}
