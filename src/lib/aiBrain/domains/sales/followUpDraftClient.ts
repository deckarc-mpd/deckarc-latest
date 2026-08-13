// Nuanced follow-up drafting (AI tier, Frozen §4/§7). Same structural
// safety property as Phase 5's client-communication DraftClient: the
// client only ever sees a StaleLeadFinding — a lead's name, company, and
// how long it's been stale — never raw pipeline data, so it cannot
// fabricate a claim about the lead's history. validateFollowUpGroundedness
// independently checks the produced draft actually names the lead.

import type { StaleLeadFinding, LeadFollowUpDraft } from './types.ts';

export interface FollowUpDraftClient {
  draft(finding: StaleLeadFinding): Promise<{ subject: string; body: string }>;
}

/** Pure template interpolation — used as the default so this SOP is fully testable without a live LLM. */
export class DeterministicFollowUpDraftClient implements FollowUpDraftClient {
  async draft(finding: StaleLeadFinding): Promise<{ subject: string; body: string }> {
    return {
      subject: `Following up, ${finding.fullName}`,
      body: `Hi ${finding.fullName}, just checking back in — we haven't connected in a bit and wanted to see if you still had questions about getting started. Happy to hop on a quick call whenever works for you.`,
    };
  }
}

/**
 * Real, server-side model-backed implementation — same REST/fallback
 * pattern as every prior AI-tier client in this codebase. NOT exercised
 * against a live model from this sandbox.
 */
export class GeminiFollowUpDraftClient implements FollowUpDraftClient {
  private endpoint: string;
  private fallback = new DeterministicFollowUpDraftClient();

  constructor(endpoint: string = '/api/ai-brain/draft-lead-followup') {
    this.endpoint = endpoint;
  }

  async draft(finding: StaleLeadFinding): Promise<{ subject: string; body: string }> {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: finding.fullName, companyName: finding.companyName, status: finding.status, daysSinceCreated: finding.daysSinceCreated }),
      });
      if (!res.ok) throw new Error(`draft endpoint returned ${res.status}`);
      const data = (await res.json()) as Partial<{ subject: string; body: string }>;
      if (!data || typeof data.subject !== 'string' || typeof data.body !== 'string' || !data.body.trim()) {
        throw new Error('malformed draft response');
      }
      return { subject: data.subject, body: data.body };
    } catch {
      return this.fallback.draft(finding);
    }
  }
}

export function validateFollowUpGroundedness(draft: LeadFollowUpDraft, finding: StaleLeadFinding): { grounded: boolean } {
  const haystack = `${draft.subject}\n${draft.body}`;
  return { grounded: haystack.includes(finding.fullName) };
}
