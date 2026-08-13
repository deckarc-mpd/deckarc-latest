// Client communication drafting (AI tier, Frozen §4/§7).
//
// Structural safety: DraftClient.draft() receives only a
// ClientCommunicationCandidate — its `anchors` array of verified facts —
// never raw project/decision/delay rows. There is nothing to fabricate a
// STATUS from because no status field is even in scope here; the drafting
// step's only job is turning already-verified facts into readable prose.
//
// Behavioral safety: validateDraftGroundedness() independently re-checks
// that every anchor's value appears verbatim in the produced draft. The
// SOP (sops/clientCommunicationDraft.ts) treats a failed groundedness
// check as a workflow failure, not a warning — an ungrounded draft never
// reaches a human as if it were trustworthy.

import type { ClientCommunicationCandidate, ClientCommunicationDraft } from './types.ts';

function anchor(candidate: ClientCommunicationCandidate, label: string): string {
  return candidate.anchors.find((a) => a.label === label)?.value ?? '';
}

export interface DraftClient {
  draft(candidate: ClientCommunicationCandidate): Promise<{ subject: string; body: string }>;
}

/**
 * Pure template interpolation of the given anchors — used as the default so
 * this SOP is fully testable without a live LLM, and because it is
 * mechanically incapable of fabricating a fact (it only ever echoes what's
 * in `anchors`). Mirrors DeterministicRiskInterpreter/DeterministicSynthesisClient.
 */
export class DeterministicDraftClient implements DraftClient {
  async draft(candidate: ClientCommunicationCandidate): Promise<{ subject: string; body: string }> {
    if (candidate.occasion === 'decision_reminder') {
      const decision = anchor(candidate, 'Decision');
      const neededBy = anchor(candidate, 'Needed by');
      const byClause = neededBy !== 'no date set' ? ` by ${neededBy}` : '';
      return {
        subject: `Action needed: ${decision}`,
        body: `Hi there — we need your input on "${decision}"${byClause} to keep your project on schedule. Please let us know your selection when you have a moment, and reach out if you have any questions.`,
      };
    }

    const reason = anchor(candidate, 'Reason');
    const revised = anchor(candidate, 'Revised completion');
    const completionClause =
      revised !== 'to be determined'
        ? `We now expect to complete this phase by ${revised}.`
        : 'We are working to confirm a new timeline and will follow up soon.';
    return {
      subject: 'A quick update on your project schedule',
      body: `We wanted to give you a heads-up: ${reason}. ${completionClause}`,
    };
  }
}

/**
 * Real, server-side model-backed implementation — same REST/fallback
 * pattern as GeminiRiskInterpreter and GeminiSynthesisClient. NOT
 * exercised against a live model from this sandbox. On any failure or
 * malformed response, falls back to DeterministicDraftClient rather than
 * blocking or fabricating — the fallback is itself anchor-only, so it can
 * never fail the groundedness check either.
 */
export class GeminiDraftClient implements DraftClient {
  private endpoint: string;
  private fallback = new DeterministicDraftClient();

  constructor(endpoint: string = '/api/ai-brain/draft-client-communication') {
    this.endpoint = endpoint;
  }

  async draft(candidate: ClientCommunicationCandidate): Promise<{ subject: string; body: string }> {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occasion: candidate.occasion, anchors: candidate.anchors }),
      });
      if (!res.ok) throw new Error(`draft endpoint returned ${res.status}`);
      const data = (await res.json()) as Partial<{ subject: string; body: string }>;
      if (!data || typeof data.subject !== 'string' || typeof data.body !== 'string' || !data.body.trim()) {
        throw new Error('malformed draft response');
      }
      return { subject: data.subject, body: data.body };
    } catch {
      return this.fallback.draft(candidate);
    }
  }
}

export function validateDraftGroundedness(
  draft: ClientCommunicationDraft,
  candidate: ClientCommunicationCandidate
): { grounded: boolean; missingAnchors: string[] } {
  const haystack = `${draft.subject}\n${draft.body}`;
  const missingAnchors = candidate.anchors
    .filter((a) => a.value && a.value !== 'no date set' && a.value !== 'to be determined')
    .filter((a) => !haystack.includes(a.value))
    .map((a) => a.label);
  return { grounded: missingAnchors.length === 0, missingAnchors };
}
