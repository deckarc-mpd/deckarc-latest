# CP360 AI Operations Brain — Implementation Plan

Sequences Frozen Architecture v4's priority order (§21) against the actual repository state found in Phase 0. This is a **plan document only** — per the user's explicit instruction, no implementation begins under this plan until it is reviewed and approved. Each phase lists: frozen-architecture priority, exit gate (frozen §22), what already exists to build on, what must be built new, and the governing ADR/gate documents.

---

## Phase 0 — Inspect and Document (this phase)

**Status**: Complete upon delivery of the eight documents listed below. **Stop here until explicit review/approval.**

Deliverables (this set):
1. `CP360_AI_PHASE0_DISCOVERY.md`
2. `CP360_AI_GAP_ANALYSIS.md`
3. `ADR-CP360-AI-001_CANONICAL_SYSTEM.md`
4. `ADR-CP360-AI-002_LEAN_INFRASTRUCTURE.md`
5. `CP360_AI_IMPLEMENTATION_PLAN.md` (this file)
6. `CP360_INTEGRATION_PERMISSION_MATRIX.md`
7. `CP360_SCHEDULED_OPERATING_EVENTS.md`
8. `CP360_AI_COST_BASELINE.md`

No code, schema, or config in the application was changed to produce these.

---

## Phase 1 — Trust Foundation: Audit, Events, SOP/Workflow, Controlled Tools, Policy/Approval

**Frozen priority**: P1. **Exit gate (frozen §22)**: *"One event/scheduled trigger can run SOP → policy → approval/tool → verification → audit and be replayed."*

**Why first**: Gap Analysis §13 ranks this the top gap — every later phase (agents, scheduling, integrations, voice) depends on it existing, and the frozen architecture is explicit that audit/trust must precede autonomy.

**Build on**:
- `activity_log` table — extend its shape rather than replace (Discovery §9).
- `user_consents.ai_consent_version` — already-modeled AI-consent hook.
- The existing `VoiceAssistant.tsx` confirm/cancel pattern — generalize into the real policy engine's confirmation UX contract (Gap Analysis §10).

**Build new**:
- Correlated audit schema (event / workflow-run / agent-run / tool-call / approval / state-change / human-override / verification record types; `company_id` + `project_id` + `workflow_id` + `correlation_id` on every row) — per frozen §12's minimum-fields table.
- Server-side-authoritative audit writes (fix today's `WITH CHECK (true)` trust-the-client pattern — Gap Analysis §1).
- Agent Registry (stable IDs per Identity spec; config-driven, no agent hardcoded by name in logic).
- One SOP/workflow persistence layer, usable identically from UI, scheduler, voice, email, API (frozen §23.4).
- Controlled Tools layer wrapping existing domain functions first (`scheduleEngine.cascadeDelayFromTask` as the first controlled tool; the read/write tool sets already enumerated in `voice-assistant.ts` as the next two) rather than writing new domain logic.
- Policy/authority engine enforcing `CP360_INTEGRATION_PERMISSION_MATRIX.md`.
- Fix: `voice-assistant.ts` authorization currently trusts a client-supplied email (Discovery §10.2) — must move to verified session-token auth (matching `api/assistant.js`'s existing correct pattern) as part of this phase, before any agent work extends past the single hardcoded admin.
- Tighten RLS/org-scoping on tables the Controlled Tools layer will touch (Gap Analysis §13.5) so agent reads/writes are correctly tenant-scoped even before every legacy RLS policy is revisited.
- Minimal AI cost/token logging on every LLM call (Cost Baseline §4) — built now, not retrofitted later.

**Explicitly not built yet**: any of the six agents' actual reasoning/personality, the Integration Gateway, the scheduler, the Knowledge Brain, voice re-platforming beyond the auth fix above.

---

## Phase 2 — Project Ops: Field Update, Daily Review, Tomorrow Readiness

**Frozen priority**: P2. **Exit gate**: *"3-5 live projects produce accurate status/readiness/trade workflows in L1-L3."*

**Build on**: Extensive existing UI/data — `TasksTab`, `DailyUpdatesTab`, `PhaseReadinessTab`, `CrewConfirmationsTab`, `MaterialsTab`, `ScheduleUpdatesSection`, `ScheduleChangeLogTab`, and `scheduleEngine.ts`. Per Gap Analysis §12, this phase is **"wire existing screens to new SOPs," not "build new screens."**

**Build new**: `project_operations` (Marcus) agent config in the Registry; SOPs for field-update intake and tomorrow-readiness gate evaluation, running through Phase 1's Controlled Tools/Policy layer at the authority levels defined in `CP360_INTEGRATION_PERMISSION_MATRIX.md` §2.

---

## Phase 3 — Trade / Material Coordination

**Frozen priority**: P3.

**Build on**: `materials`, `crew_confirmations` tables; the Trade Confirmation Cutoff sweep design already specified in `CP360_SCHEDULED_OPERATING_EVENTS.md`.

**Build new**: workflow/message automation for confirmation requests (depends on Phase 4's Integration Gateway for actual send capability — Phase 3 can implement the deterministic detection/workflow logic and stub the send step, or sequence after Phase 4's Gmail piece specifically if send capability is needed sooner).

---

## Phase 4 — Scheduled Operating Rhythm, Chief of Staff, Action Center

**Frozen priority**: P4. **Exit gate**: *"Owners can manage a day from one Command/Action Center with low alert noise."*

**Build on**: `CP360_SCHEDULED_OPERATING_EVENTS.md`'s full cadence table; `actionBoardHelpers.ts`'s existing category-derivation pattern (already closely matches frozen §18's Action Center queue model — Gap Analysis §11); `DashboardPage`/`ActionBoardPage`/`ProjectPulse.tsx`; `project_calendars`/`us_holidays` for business-calendar-aware scheduling.

**Build new**: Vercel Cron / Supabase `pg_cron` sweep functions (per `ADR-CP360-AI-002`); `chief_of_staff` (Avery) agent; company-level timezone/business-calendar config (currently only project-level — Scheduled Events §4 gap); extend `action_items`/Action Center categories to include `AI Handling`/`Watching` states (currently only open/done exist — Gap Analysis §11).

**Note this is also the Integration Gateway's natural home**, since several scheduled routines (client communication check, trade confirmation cutoff) need Gmail/Calendar send capability to be fully real rather than draft-only. This plan sequences the Integration Gateway's build to **start in Phase 4** (not deferred to P5/P6) specifically so the Scheduled Operating Rhythm can reach real (not stubbed) execution — this is a deliberate sequencing adjustment from a strict reading of frozen §21, justified because §11's scheduled-rhythm routines are explicitly Gmail/Calendar-dependent for full completion, and building them twice (once stubbed, once real) would be wasted work. This adjustment should be confirmed with the product owner during plan review, not assumed.

---

## Phase 5 — Customer Success

**Frozen priority**: P5. **Exit gate**: *"Client updates use verified facts and have low human edit rate."*

**Build on**: `client_decisions`, `communication_log`, `CommunicationHubTab.tsx`, the existing (non-AI) `AiSummaryTab.tsx` "Client Update" generator as a functional-requirements reference (its deterministic template already encodes what a good client update contains — Discovery §5, item 1) — this phase should **supersede** that mislabeled feature with a real, policy-gated AI draft + admin-approval flow, not leave both running in parallel.

**Build new**: `customer_success` (Natalie) agent; client-facing communication SOPs at L2 authority (Permission Matrix §2/§3) — never unreviewed sends.

---

## Phase 6 — Two-Way Voice

**Frozen priority**: P6.

**Critical sequencing note** (Gap Analysis §12): the existing `VoiceAssistant.tsx`/`voice-assistant.ts` prototype is **more feature-complete today than the P1 foundation it should sit on**. This plan's explicit instruction: **freeze that code at bug-fix-only status (the auth fix lands in Phase 1) until Phases 1–5 exist**, then re-platform its existing tool-calls (`navigate`, `query_*`, `create_project`, `update_task_status`) onto the real Controlled Tools + Policy + Audit layers, generalizing past the single hardcoded admin email using the Agent Registry to resolve spoken names ("Ask Marcus...") to stable agent IDs per the Identity spec. Do not build a second, parallel voice stack — extend this one.

**Build new**: name resolution (display name → stable agent ID) for the Identity spec's natural-language voice commands; the read-back/confirmation rules in `CP360_INTEGRATION_PERMISSION_MATRIX.md` §4.

---

## Phase 7 — Compliance

**Frozen priority**: P7.

**Build on**: `permits`, `inspections`, `ProjectInspectionRequirement` (already models sequencing/prerequisites/readiness status — a strong existing foundation per Discovery §9), `PermitsTab`/`InspectionsTab`/`InspectionChecklistTab`.

**Build new**: `compliance` (Clara) agent; Daily Permit/Inspection Sweep (already specified in Scheduled Events).

---

## Phase 8 — Finance Services / AR / Margin

**Frozen priority**: P8.

**Build on**: `change_orders`, `payment_milestones`, `PaymentsTab`/`ChangeOrdersTab` — fully deterministic today (Gap Analysis §3), which is **already correct** per frozen §5. This phase adds AI **only** for ambiguous invoice/client-response interpretation and exception synthesis, on top of the existing deterministic billing/margin logic — never replacing it.

**Build new**: Billing/AR/Margin Sweep (Scheduled Events); no new agent — finance stays "deterministic services + SOP workflows... not a separate AI executive" per frozen §5, consistent with the current codebase already having zero AI in this area.

---

## Phase 9 — Sales + Estimator

**Frozen priority**: P9.

**Build on**: `cp360_leads` table/`CP360LeadsPage.tsx` (currently a plain intake list, no AI).

**Build new**: `sales` (Maya) and `estimating` (Daniel) agents; Sales Pipeline Hygiene sweep (Scheduled Events).

---

## Phase 10 — Per-SOP L4 Autonomy

**Frozen priority**: P10. **Exit gate**: *"Selected SOP meets measured reliability, cost and rollback criteria before L4."*

No SOP starts here (Permission Matrix §1). Promotion candidates are chosen from Phases 2–9's SOPs based on real measured data from the audit/metrics system built in Phase 1 — this phase is evaluation-and-promotion work, not new feature build.

---

## Phase 11 — Multi-Company Productization

**Frozen priority**: P11.

**Build on**: `organizations`/tenant schema already anticipates this (Discovery §4) — `organization_type` distinguishes Platform Owner vs. Contractor Company today.

**Build new/fix first**: Gap Analysis §12 flags that **the schema is ready for multi-company sooner than the RLS security model is** — the org-scoping tightening work flagged for Phase 1 (Gap Analysis §13.5) is a hard prerequisite for onboarding a real second company, not something this phase can defer further.

---

## Cross-Cutting Constraints (apply to every phase above)

1. **Every new infrastructure component gets an ADR** following the template in `CP360_AI_COST_BASELINE.md` §3, before it's built — not after.
2. **Every AI invocation answers the seven questions in frozen §23.6** before it ships (what needs AI, what deterministic pre-filter runs first, what schema is enforced, what data source, model-unavailable fallback, cheapest viable model class, cost measurement).
3. **Every new agent beyond the frozen six requires the ADR in frozen §23.7** — none are proposed by this plan.
4. **No phase refactors unrelated working code.** Per the user's Phase 0 instruction and frozen §23.1, existing modules (schedule engine, tabs, RLS) are extended and wrapped, not rewritten, unless a specific defect (like the `voice-assistant.ts` auth issue) is being fixed as a named prerequisite.
5. **Definition of Done is business completion, not activity** (frozen §23.9) — every phase's exit criteria above are stated as business outcomes, not "a message was sent" or "a UI card rendered."

## Immediate Next Step

This plan, along with the other seven Phase 0 documents, is submitted for review. **No Phase 1 work begins until explicit approval is given**, per the user's instruction.
