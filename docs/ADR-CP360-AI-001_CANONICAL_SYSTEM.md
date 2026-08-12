# ADR-CP360-AI-001: Canonical System of Record

**Status:** Accepted
**Date:** 2026-08-12
**Phase:** P0
**References:** `docs/ai-brain/brain.txt` §9 ("One Shared Integration Gateway"), §10 ("One Knowledge Brain"); `CP360_AI_PHASE0_DISCOVERY.md` §§4, 6–7.

## Context

The frozen architecture connects CP360 to Gmail, Google Calendar, and Google Drive via a shared Integration Gateway (brain.txt §9), and requires "Durable knowledge requires source, date/version, scope and review status" (§10). Neither exists in the current codebase (`CP360_AI_PHASE0_DISCOVERY.md` §6). Before any of it is built, the system needs one unambiguous rule for what happens when CP360's own data and an external system's data (a Gmail thread, a Calendar event, a Drive file) appear to disagree about the same fact — e.g., a client confirms a walkthrough time by email, but CP360's `tasks` table still shows the old time.

Phase 0 discovery confirms CP360's Postgres schema (`projects`, `tasks`, `permits`, `inspections`, `change_orders`, `payment_milestones`, `client_decisions`, etc. — see Discovery §4) is already the application's sole functional database: every page reads and writes it directly, RLS enforces access to it, and no other system currently holds any project-operational fact. There is nothing to reconcile today because nothing external is connected yet — which makes this the right moment to fix the rule before an integration exists to test it against.

## Decision

**CP360's own Postgres database is the single canonical system of record for all operational facts.** Gmail, Google Calendar, and Google Drive are **supporting evidence and execution surfaces only** — never sources of truth for project state.

Concretely:

1. **Canonical facts live in CP360 domain tables**, full stop. Project status, task dates, permit/inspection status, client decisions, payments, change orders, compliance state — all authoritative in Postgres, as they are today.
2. **External systems are one-directional inputs and outputs, mediated by the Integration Gateway.** Gmail/Calendar/Drive can *trigger* a workflow (a new email, a calendar RSVP, a new Drive file) and can be *written to* as an execution step of an approved workflow (send an email, create a calendar invite, upload a file) — but a Gmail message or Calendar event is never read back later as the current value of a CP360 fact. If a workflow needs to know "is the walkthrough still Thursday at 2pm," it asks the `tasks`/`client_decisions` table, not the Calendar API.
3. **Ingested external content becomes CP360 data through an explicit, auditable write**, not implicit trust. When an inbound Gmail message or Calendar change is relevant to a project fact, the SOP/workflow that processes it must write the resolved fact into the appropriate domain table (with the normal CODE→AI→HUMAN routing — e.g., an ambiguous client email may need AI interpretation and, per brain.txt's authority rules, human confirmation before it changes a schedule or price). The email itself remains linked as supporting evidence (e.g., via a reference/attachment on the resulting `activity_log`/audit record), not as the live value.
4. **Working hypotheses (e.g., "email suggests permit may be delayed, unconfirmed") belong in workflow/risk state**, not silently overwriting canonical fields, consistent with brain.txt §10's "working hypotheses belong in workflow/risk state" rule for the Knowledge Brain — the same rule extends naturally to inbound integration data.
5. **Connector staleness is a first-class signal, not a silent failure.** Per brain.txt §9, the Integration Gateway must track connector health and sync cursors; if Gmail/Calendar/Drive data is stale, any workflow depending on it must know that and avoid drawing an autonomous conclusion from stale external state (this is also a named Validation Rule in brain.txt §24: "Connector freshness — No autonomous conclusion from stale external state").
6. **Knowledge Brain content sourced from Drive/Gmail (e.g., a scanned permit document, a subcontractor's emailed quote) is treated as evidence with provenance**, not canonical fact — it is stored with source, date/version, scope, and review status (brain.txt §10) and is retrievable, but the underlying project/vendor/estimate record in Postgres remains the fact of record.

## Consequences

- **Positive:** Reconciliation logic only ever flows one direction (external → CP360, through an explicit write), which is far simpler to reason about, audit, and roll back than bidirectional sync. It also matches how CP360 already behaves today (§4 of Discovery — Postgres is already the only thing every page trusts).
- **Positive:** This decision directly satisfies the frozen architecture's non-negotiable connector rules (brain.txt §9, §14) without requiring any new infrastructure — it's a data-flow rule, not a system.
- **Negative / tradeoff:** Users who edit something directly in Gmail or Google Calendar (e.g., reschedule a meeting from their phone's calendar app) will not see that change reflected in CP360 until the Integration Gateway's inbound sync processes it and a workflow writes the resolved fact back. This is an accepted latency cost in exchange for auditability and determinism — real-time bidirectional sync is explicitly not being built.
- **Negative / tradeoff:** Every inbound integration event that could affect a canonical fact needs an explicit SOP/workflow to resolve it into a write; ad hoc "just trust the calendar" shortcuts are disallowed even when they'd be simpler to build.

## Alternatives Considered

- **Google Workspace as source of truth for scheduling/communication, CP360 as source of truth for everything else.** Rejected: creates exactly the two-master reconciliation problem this ADR exists to avoid, and conflicts with brain.txt §9's explicit statement that "External email/calendar/Drive state is supporting evidence or execution surface; CP360 remains canonical operational state."
- **Bidirectional real-time sync (last-write-wins or CRDT-style merge).** Rejected as premature infrastructure per brain.txt §14 ("do not introduce enterprise infrastructure merely because the future architecture could use it") — no measured need exists, and it would make audit/authority enforcement far harder (an external system could silently produce a fact change with no policy/approval check).
- **Treat all three (CP360, Gmail, Calendar/Drive) as equally authoritative per-field.** Rejected: not implementable without a conflict-resolution engine, which is exactly the kind of infrastructure the lean-first mandate defers until proven necessary.

## Rollback

This is a data-flow policy decision, not a running system — there is nothing to "roll back" technically. If a future measured need proves one-directional sync insufficient (e.g., a proven business requirement for true real-time calendar bidirectional sync), that would be raised as a new ADR with its own measured-evidence justification, not a silent reversal of this one.
