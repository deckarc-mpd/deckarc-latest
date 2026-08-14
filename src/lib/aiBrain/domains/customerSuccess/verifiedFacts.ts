// Deterministic verified-facts gathering (CODE tier, Frozen §4/§7). This is
// the ONLY place client_decisions/project_delay_reasons rows get read —
// everything downstream (the draft client) only ever sees the narrow
// VerifiedClientFacts/anchors this produces, never the raw rows, so a
// drafting step structurally cannot invent a status, date, or reason that
// didn't come from CP360.

import type {
  ReadinessDecision,
  ReadinessDelayReason,
  ClientCommunicationCandidate,
  VerifiedClientFacts,
} from './types.ts';

const CLOSED_DECISION_STATUSES = new Set(['Approved', 'Received']);

export function gatherVerifiedClientFacts(
  projectId: string,
  asOfDate: string,
  decisions: ReadinessDecision[],
  delayReasons: ReadinessDelayReason[]
): VerifiedClientFacts {
  const candidates: ClientCommunicationCandidate[] = [];

  for (const d of decisions) {
    if (d.project_id !== projectId) continue;
    if (CLOSED_DECISION_STATUSES.has(d.status)) continue;
    candidates.push({
      occasion: 'decision_reminder',
      sourceId: d.id,
      projectId,
      anchors: [
        { label: 'Decision', value: d.decision_title },
        { label: 'Needed by', value: d.needed_by_date ?? 'no date set' },
      ],
    });
  }

  for (const r of delayReasons) {
    if (r.project_id !== projectId) continue;
    if (!r.client_visible) continue;
    if (!r.client_safe_reason.trim()) continue; // nothing vetted-safe to draft from — never fall back to internal_reason.
    candidates.push({
      occasion: 'delay_update',
      sourceId: r.id,
      projectId,
      anchors: [
        { label: 'Reason', value: r.client_safe_reason },
        { label: 'Revised completion', value: r.revised_projected_completion ?? 'to be determined' },
      ],
    });
  }

  return { projectId, asOfDate, candidates };
}

/** Deterministic pre-filter: zero AI calls if nothing needs communicating (Frozen §11). */
export function shouldDraftClientCommunication(facts: VerifiedClientFacts): boolean {
  return facts.candidates.length > 0;
}
