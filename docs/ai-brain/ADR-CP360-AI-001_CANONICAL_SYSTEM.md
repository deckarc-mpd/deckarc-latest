# ADR-CP360-AI-001: CP360 (Supabase) Is the Canonical System of Record; Gmail/Calendar/Drive Are Supporting Evidence and Execution Surfaces

- **Status**: Proposed (Phase 0 — for product-owner review before Phase 1 build begins)
- **Date**: 2026-08-12
- **Driven by**: Frozen Architecture v4 §9 ("One Shared Integration Gateway"), §16, §23.4
- **Related**: `CP360_AI_PHASE0_DISCOVERY.md` §7 (no Google integration exists today), `CP360_AI_GAP_ANALYSIS.md` §5, `CP360_INTEGRATION_PERMISSION_MATRIX.md`

## Context

Phase 0 discovery confirmed CP360 has **no existing Gmail, Google Calendar, or Google Drive integration code** — the current `IntegrationSettingsPage.tsx` lists Calendar as a UI placeholder and has no Gmail/Drive rows at all. This means the canonical-vs-supporting-system question has not been implicitly decided by legacy code; it is a clean decision to make explicitly before any OAuth/sync code is written.

CP360's existing data model (`projects`, `tasks`, `permits`, `inspections`, `daily_updates`, `change_orders`, `payment_milestones`, `communication_log`, `activity_log`, etc. — 68 migrations' worth) is deep, structured, RLS-governed, and already the basis for every operational screen in the product (Dashboard, Action Board, Project Pulse, client portal). Gmail/Calendar/Drive, once integrated, will contain overlapping information (an email thread confirming a subcontractor's schedule; a calendar event for an inspection; a Drive folder of permit PDFs) but in unstructured or loosely-structured form, outside CP360's tenant/role/RLS model, and outside CP360's control.

The frozen architecture already states the intended answer (§9: *"External email/calendar/Drive state is supporting evidence or execution surface; CP360 remains canonical operational state"*) but does not spell out the operational implications for a codebase where none of this exists yet. This ADR records the decision formally so every future connector, SOP, and workflow is built consistently with it, and so it is not silently re-decided differently per integration.

## Decision

**CP360's Postgres database (via Supabase) is the single canonical system of record for all operational facts.** Gmail, Google Calendar, and Google Drive are treated as:

1. **Execution surfaces** — places CP360 sends things (a calendar invite for an inspection, an email to a subcontractor, a file placed in a client's Drive folder) as the *result* of a CP360-owned decision, not as the place that decision is made.
2. **Evidence sources** — places CP360 *reads* to detect real-world events (a reply email, a moved calendar event, a new file) that get normalized into CP360 events and reconciled against CP360's own state, never trusted as-is.

Concretely:

- **No field in Gmail/Calendar/Drive is ever the only copy of an operational fact.** If a fact matters to a workflow (an inspection date, a subcontractor confirmation, a client decision), it must be written into the corresponding CP360 table (`inspections.scheduled_date`, `crew_confirmations`, `client_decisions`, etc.) as part of handling the normalized event — not left to live only in a calendar event or an email body.
- **CP360 owns OAuth token storage and refresh**, in one shared table/service (the Integration Gateway — see ADR-002 and the Permission Matrix), scoped by organization and by connected Google account. No agent, SOP, or workflow ever receives a raw Google OAuth token; they call gateway-provided tools instead (mirrors frozen §9's "agents never hold raw Google credentials").
- **Reads from Google are normalized before anything downstream sees them.** A Gmail message becomes a normalized "inbound communication" event correlated to a project/task if resolvable, or held as unlinked/needs-triage if not — never handed raw to an SOP or agent. Same pattern for Calendar events and Drive file changes.
- **Writes to Google are the last step of a workflow, not a decision point.** e.g., "send inspection confirmation" is a CP360 workflow outcome that *produces* a Calendar event and/or an email; the workflow's own state (did the inspection get scheduled, per CP360) is what other CP360 logic reads, not "does a calendar event exist."
- **Conflicts resolve in favor of CP360, with the mismatch surfaced, not silently overwritten.** If a calendar event is moved by a homeowner directly in their Google Calendar, CP360 does not blindly adopt the new date as fact — it creates a normalized event ("external calendar mismatch detected") that a deterministic reconciliation check (and, only if ambiguous, an agent) evaluates before CP360's own record changes. This satisfies frozen §9's "reconcile-before-retry" and stale-data-detection requirement.
- **Idempotency and connector health belong to the Gateway, not to individual workflows.** Every write to Google must be idempotent (safe to retry) and every connector must expose a health/staleness signal so downstream SOPs can refuse to act on stale external state (frozen §9, and the Validation Rules in §24 — "no autonomous conclusion from stale external state").

## Consequences

**Positive:**
- Every future SOP/workflow has one unambiguous rule for "where do I get the real answer": CP360's DB, always. No workflow author has to decide per-feature whether Gmail or CP360 wins.
- RLS, tenancy, and role-based access — CP360's existing, working security model — continues to be the enforcement point for who can see what, even for data that originated in Gmail/Calendar/Drive, once normalized into CP360 events/tables. Google's own sharing/permission model is never relied on for CP360-side authorization.
- Client Portal and multi-tenant isolation (already load-bearing in the current schema) are not weakened by adding external integrations, because externally-sourced data is only ever exposed after it lands in a CP360 table subject to the same RLS as everything else.
- Matches the existing product architecture already found in Phase 0: CP360 is already the source of truth for every operational module (schedules, tasks, permits, finance); this decision just extends that pattern to the two new integration surfaces rather than introducing a second source of truth.

**Costs / risks accepted:**
- Every Google integration requires a normalization step before use, which is more up-front work than "just read Gmail/Calendar/Drive directly from wherever it's needed" — accepted deliberately, because the alternative (agents/workflows reading Google state directly and ad hoc) is exactly what frozen §9 and §23.4 (no duplicate connector per agent) prohibit, and would recreate the "AskCP360/VoiceAssistant independently re-fetch the same data slightly differently" duplication pattern already flagged as tech debt in Phase 0 Discovery §10.4.
- Reconciliation logic (detecting and resolving CP360-vs-Google mismatches) is new deterministic code that must be designed carefully — it is a P1-adjacent Integration Gateway concern, not something to defer to "whenever an agent notices a conflict."
- Users may occasionally see CP360 "lag" a manual edit made directly in Google Calendar until the next sync/reconciliation pass — an accepted UX tradeoff in exchange for CP360 never silently absorbing unverified external edits as fact.

## Alternatives Considered

1. **Google Workspace as co-canonical** (CP360 and Gmail/Calendar/Drive both treated as authoritative, last-write-wins). Rejected: creates exactly the "two sources of truth" ambiguity the frozen architecture explicitly warns against, and would make RLS/tenant enforcement inconsistent (Google's sharing model doesn't know about CP360 organizations/roles).
2. **Google Workspace as canonical, CP360 as a read-only dashboard over it.** Rejected outright: contradicts the product's entire existing architecture (CP360 already owns and enforces every operational fact via RLS) and would require re-architecting the whole app, not just the integration layer.
3. **Per-agent/per-feature ad hoc decision** (let whichever team builds Sales integrate Gmail one way, whoever builds Compliance integrate Drive another way). Rejected: directly violates frozen §14/§23.4 ("one Integration Gateway... do not create one Gmail/Calendar/Drive connector per agent") and would make audit/reconciliation impossible to reason about consistently.

## Rollback

If, after building the Integration Gateway, real usage shows CP360-as-canonical is unworkable for a specific data type (e.g., some future ADR concludes a specific Drive folder should be treated as authoritative for file version history because Drive's own versioning is genuinely better), that would be a **narrow, explicit exception recorded in its own ADR**, not a reversal of this decision. This ADR does not need to be revisited unless the fundamental "CP360 owns operational state" premise of the whole platform changes.
