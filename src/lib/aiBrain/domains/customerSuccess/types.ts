// Customer Success (Natalie / customer_success) domain types — Phase 5.
//
// Row shapes narrowed to exactly the fields the deterministic gathering
// step reads (same "narrower than src/lib/supabase.ts" discipline as
// Project Ops' types.ts). Two DB-verified sources ground every draft:
// client_decisions (decision/selection tracking) and project_delay_reasons
// — critically, the delay source is `client_safe_reason`, the field the
// app already treats as pre-vetted client-facing language, NEVER
// `internal_reason`.

export interface ReadinessDecision {
  id: string;
  project_id: string;
  decision_title: string;
  needed_by_date: string | null;
  status: string;
}

export interface ReadinessDelayReason {
  id: string;
  project_id: string;
  delay_category: string;
  client_safe_reason: string;
  revised_projected_completion: string | null;
  client_visible: boolean;
}

export type CommunicationOccasion = 'decision_reminder' | 'delay_update';

/** A single fact pulled verbatim from CP360 with zero interpretation. Every anchor's value must appear in the final draft, or the run fails verification. */
export interface VerifiedFactAnchor {
  label: string;
  value: string;
}

export interface ClientCommunicationCandidate {
  occasion: CommunicationOccasion;
  sourceId: string;
  projectId: string;
  anchors: VerifiedFactAnchor[];
}

export interface VerifiedClientFacts {
  projectId: string;
  asOfDate: string;
  candidates: ClientCommunicationCandidate[];
}

export interface ClientCommunicationDraft {
  occasion: CommunicationOccasion;
  sourceId: string;
  subject: string;
  body: string;
}
