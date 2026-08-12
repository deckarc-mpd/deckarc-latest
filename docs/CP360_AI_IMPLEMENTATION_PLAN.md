# CP360 AI Implementation Plan

**Phase:** P0 deliverable — this is a **plan**, not implementation. Per the execution prompt's Phase Gate rule, no work beyond P0 begins until this plan and the other Phase 0 documents are reviewed and approved.
**References:** `docs/ai-brain/brain.txt` §21 (Implementation Priority — Frozen), §22 (Phase Gates), §23.10 (Implementation Sequence); `docs/ai-brain/employeeidentity.txt`; `CP360_AI_PHASE0_DISCOVERY.md`; `CP360_AI_GAP_ANALYSIS.md`.

Priorities P0–P11 are frozen and must not be reordered (brain.txt §21). Each phase below states: goal, concrete deliverables mapped to this specific repo, what gets extended vs. newly built, and the exit gate from brain.txt §22 that must be satisfied before the next phase starts. "Within each phase: inspect, plan, build smallest vertical slice, test, add audit/evaluation, run workflows, update docs, summarize, and continue only if phase gate is satisfied" (execution prompt) applies to every phase below, not just P0.

---

## P0 — Discovery (this deliverable set)

**Status: Complete.**

Deliverables: `CP360_AI_PHASE0_DISCOVERY.md`, `CP360_AI_GAP_ANALYSIS.md`, `ADR-CP360-AI-001_CANONICAL_SYSTEM.md`, `ADR-CP360-AI-002_LEAN_INFRASTRUCTURE.md`, this plan, `CP360_INTEGRATION_PERMISSION_MATRIX.md`, `CP360_SCHEDULED_OPERATING_EVENTS.md`, `CP360_AI_COST_BASELINE.md`.

**Exit gate (brain.txt §22):** "Current architecture, reusable modules, integrations, scheduler/jobs, role model and data gaps documented." — Satisfied by the documents listed above.

**STOP condition:** Per the execution prompt, implementation work does not begin until these documents are reviewed by the product owner. Nothing below this line is authorized to start yet.

---

## P1 — Foundation: Audit, Events, SOP/Workflow, Controlled Tools, Policy/Authority, Approvals, Feature Flags

**Why first (brain.txt §21):** "Trust foundation before autonomy." Every later phase's AI actions must be audited, policy-checked, and (where consequential) human-approved — none of that exists today (Gap Analysis §§2–4).

**Deliverables, mapped to this repo:**
1. **Audit** — extend `activity_log` with `company_id`, `workflow_id`, `correlation_id`, and a `record_type` column (or sibling tables) covering Event / Workflow run / Agent run / Tool call / Approval / State change / Human override / Verification per brain.txt §12's minimum-fields table. New writes go through a single audit-write helper, not ad hoc inserts.
2. **Event abstraction** — new `events` table + a small dispatcher module (`src/lib/events.ts` or a new Edge Function) that normalizes UI actions, scheduler ticks, and (later) inbound Gmail/Calendar/Drive activity into one event shape.
3. **Agent/SOP registry** — new tables holding the six frozen AI employees' metadata (Agent ID, Display Name, Title, Domain, Mission, Responsibilities, Assigned SOPs, Allowed Tools, Data Permissions, Authority Level, Escalation Policy, Model Policy, Cost Budget, Status, Version — employeeidentity.txt §4), seeded with the approved six identities (employeeidentity.txt §1) and their stable IDs (`chief_of_staff`, `sales`, `estimating`, `project_operations`, `compliance`, `customer_success`). Registry UI stays minimal per employeeidentity.txt §4 ("do not overbuild the Agent Registry UI").
4. **Workflow persistence** — new `workflow_runs`/`workflow_steps` tables (state, trigger, waiting_on, due_at per brain.txt §12) capable of representing a run triggered from UI, scheduler, voice, email, or API identically.
5. **Controlled Tools layer** — a server-side (Supabase Edge Function or Vercel serverless) tool-execution surface that wraps existing operations (starting with `scheduleEngine.ts`'s cascade, `alertUtils.ts`'s deterministic checks, and basic CRUD on `tasks`/`action_items`) behind named, typed, audited tools. This formally replaces the ad hoc client-executed tool pattern in `api/voice-assistant.ts` (Gap Analysis §11) — that file is not extended further.
6. **Policy/Authority engine** — a minimal rules table/module deciding, per agent + action + role, whether an action executes automatically, needs human approval, or is out of authority entirely (CODE→AI→HUMAN routing, brain.txt §7). Replaces the informal `DATA_TOOLS`/`WRITE_TOOLS` set-membership check.
7. **Approvals** — a general-purpose `approvals` table (approval_id, exact payload hash/version, approver, decision, channel, timestamp per brain.txt §12). `action_items.admin_approval_required` and `schedule_change_requests` become consumers of this primitive rather than parallel one-off mechanisms where practical.
8. **Feature flags** — a minimal `feature_flags` table so each new AI capability can be enabled per-organization/per-role before wide rollout.
9. **Model routing + cost logging** — a small module (not "a complex multi-provider optimization service") that any Edge/serverless function calls instead of hardcoding a model name, logging cost/tokens/latency per call against `agent_id`/`workflow_id`.
10. **Decommission or gate the existing unaudited AI paths** — `AskCP360.tsx`'s fake-AI mock is replaced (or clearly re-labeled as a static help panel); `api/assistant.js` and `api/voice-assistant.ts` either get retired or gated behind a feature flag until they route through the new Controlled Tools/Policy/Audit chain (Gap Analysis §1, §11).

**Exit gate (brain.txt §22):** "One event/scheduled trigger can run SOP → policy → approval/tool → verification → audit and be replayed." Concretely: pick one trivial real SOP (e.g., "flag an overdue permit") and prove it can be triggered from the UI, produce a policy decision, optionally require and record an approval, execute a controlled tool, verify the result, write a full audit trace, and be replayed from that trace end to end.

---

## P2 — Project Ops: Field Update, Daily Review, Tomorrow Readiness

**Owner:** Marcus (`project_operations`).

**Deliverables:** SOPs built on P1's foundation for: ingesting daily field updates (`daily_updates` table already exists) into structured task/risk state; a deterministic "Tomorrow Readiness" gate sweep (crew confirmation, material readiness, permit/inspection prerequisites — all data already modeled in `crew_confirmations`, `materials`, `permits`, `project_inspection_requirements`) with AI only for interpreting free-text exceptions; wiring `scheduleEngine.ts`'s cascade as a Controlled Tool invoked by SOPs rather than called directly from UI code.

**Exit gate (brain.txt §22, shared with P3):** "3–5 live projects produce accurate status/readiness/trade workflows in L1–L3" (L1–L3 = increasing but still human-supervised autonomy levels, per brain.txt §24's validation-before-autonomy framing).

---

## P3 — Trade/Material Coordination

**Owner:** Marcus (`project_operations`).

**Deliverables:** SOPs for subcontractor/material coordination workflows layered on `materials`, `crew_confirmations`, and (once P1's tool layer exists) automated trade-confirmation messaging. This is where the Integration Gateway's email-sending capability first becomes genuinely necessary for an operational workflow (trade confirmation follow-ups) — see the Integration Gateway's sequencing note below.

**Exit gate:** Shared with P2 above.

---

## P4 — Scheduled Operating Rhythm, Chief of Staff, Action Center

**Owner:** Avery (`chief_of_staff`), consuming outputs from all domain SOPs.

**Deliverables:**
1. **Scheduler** — implement the operating clock per `CP360_SCHEDULED_OPERATING_EVENTS.md` (Supabase `pg_cron` or Vercel Cron), each scheduled event running a deterministic sweep first and only invoking AI when a material exception exists (brain.txt §11's zero-AI-call rule).
2. **Chief of Staff synthesis** — wrap `actionBoardHelpers.ts`'s existing exception-compression output (Discovery §11, Gap Analysis §7) as Avery's structured input; add the AI synthesis step that produces the "5–10 decisions that actually matter today" (brain.txt §8, Figure 5) rather than raw item lists.
3. **Action Center** — build the six-queue UI (Needs My Decision / Critical Now / AI Handling / Watching / Completed / Blocked, brain.txt §18) as a single shared inbox — explicitly not a per-agent inbox — replacing/consolidating the current `ActionBoardPage.tsx` + `AlertsPage.tsx` split where appropriate.
4. **Command Center UX** — the "Good morning" executive summary example from employeeidentity.txt §5, attributed to Avery.

**Exit gate (brain.txt §22):** "Owners can manage a day from one Command/Action Center with low alert noise."

---

## P5 — Customer Success

**Owner:** Natalie (`customer_success`).

**Deliverables:** SOPs for verified client communication (progress updates, decisions, selections, delay communication) drafted by Natalie, gated through the Policy/Authority engine before anything client-visible ships (existing `client_visible`/`internal_only` flag patterns across `project_files`, `action_items`, `client_decisions` are directly reusable here — Discovery §7, §11). Closeout/warranty/review workflows build on `project_closeout_checklists`.

**Exit gate (brain.txt §22):** "Client updates use verified facts and have low human edit rate."

---

## P6 — Two-Way Voice

**Owner:** all six agents, via one shared Voice Operations Brain (employeeidentity.txt §6).

**Deliverables:** Replace the bespoke `api/voice-assistant.ts` business logic with a thin transport adapter (HEAR → TRANSCRIBE → resolve authenticated user/entity → classify intent → route to the *same* Controlled Tools/Policy/Approval/Audit chain P1 built, per brain.txt §19, Figure 12). Voice name resolution ("Ask Marcus...") maps spoken display names to stable `agent_id`s per employeeidentity.txt §6 — no separate voice agents, no separate per-employee voice logic. Barge-in, read-back confirmation for amounts/dates/approvals, and authenticated-session requirements (not speaker-recognition-only) are built at this layer, not per agent.

**Exit gate (brain.txt §22):** "Voice query/update/action/correction works through same tools and audit."

---

## P7 — Compliance

**Owner:** Clara (`compliance`).

**Deliverables:** SOPs for HOA/zoning/permit/inspection/COI/W-9 workflows on top of existing `permits`, `inspections`, `project_inspection_requirements` tables. This phase is the first hard dependency on the **Integration Gateway actually existing** for Drive (permit/COI document ingestion) — sequence Integration Gateway work (originally scoped loosely across P1–P6 above) so Drive connectivity is genuinely ready by P7 even if Gmail/Calendar land earlier for P3/P5's needs.

**Exit gate (brain.txt §22, shared with P8–P9):** "Domain exceptions match human review; no unauthorized consequential action."

---

## P8 — Finance Services / AR / Margin

**Owner:** no dedicated agent (brain.txt §5 — Finance stays deterministic services + SOPs). AI assists only for ambiguous invoice/client responses, dispute interpretation, explanation, and exception synthesis, invoked through the standard Controlled Tools/Policy chain like any other AI assist — not a seventh agent.

**Deliverables:** Since Gap Analysis §9 found **no existing calculation layer at all** (only CRUD on `payment_milestones`/`change_orders`), this phase builds the Billing Service, AP Workflow, Collections SOP, Margin Engine, Cost Tracking, and Cash Forecast Engine from brain.txt §5, Figure 2, as new deterministic modules — no autonomous bank/payment movement in this phase.

**Exit gate:** Shared with P7/P9 above.

---

## P9 — Sales + Estimator

**Owner:** Maya (`sales`), Daniel (`estimating`).

**Deliverables:** Lead intake/qualification/follow-up SOPs on `cp360_leads` (already exists) for Maya; scope-normalization/estimate-reasoning/comparable-analysis SOPs for Daniel, consuming the Knowledge Brain's estimate-history retrieval (P1–P6 build-out). Final price authorization remains human per brain.txt §4's "Not responsible for" column for the Estimator.

**Exit gate:** Shared with P7/P8 above.

---

## P10 — Per-SOP Controlled Autonomy (L4)

**Deliverables:** Using the metrics captured since P1 (workflow success rate, human edit/rejection rate, false/missed exception rate, duplicate action rate, cost per SOP), promote **individual SOPs** — never whole agents — to L4 autonomy once they clear every gate in brain.txt §24 (accuracy, reliability, human corrections, cost, audit, rollback, connector freshness, security, noise). "Autonomy promotion is SOP-specific. Never promote an entire agent to L4 simply because some of its workflows are reliable" (brain.txt §24).

**Exit gate (brain.txt §22):** "Selected SOP meets measured reliability, cost and rollback criteria before L4."

---

## P11 — Multi-Company Productization

**Deliverables:** Generalize the now-proven DeckArc workflows for additional companies. Concretely: make nav/role-label wiring config-driven instead of hardcoded (Discovery §3's identified gap), make the scheduled-operating-clock cadence per-organization-configurable (already designed for this in `CP360_SCHEDULED_OPERATING_EVENTS.md`), and confirm the Agent Registry/employee-naming layer supports per-customer renaming without touching business logic (the entire point of employeeidentity.txt §3's stable-ID rule) — this phase is the first real test that the naming-rules discipline held throughout P1–P10.

---

## Sequencing Notes Specific to This Repo

- **Do not build P2+ SOP logic before P1's Controlled Tools/Audit/Policy layer exists**, even though the underlying deterministic pieces (`scheduleEngine.ts`, `alertUtils.ts`, `actionBoardHelpers.ts`) already work — wrapping them in the new tool layer *is* part of P1, not a P2 nice-to-have, per the frozen sequencing.
- **Integration Gateway (Gmail/Calendar/Drive) has no dedicated phase number** in the frozen priority list — it's an infrastructure capability threaded through P3 (trade confirmation email), P5 (client communication), P6 (voice), and P7 (compliance document ingestion). Build it once, in P1–P3's timeframe, sized for whichever domain needs it first (likely P3's trade confirmations or P5's client communication), not as a big-bang P7 deliverable.
- **Retire, don't extend**, the three existing AI surfaces identified in Discovery §5 — this is called out explicitly in P1 above so it isn't missed once P1 work starts feeling "almost done" without it.
