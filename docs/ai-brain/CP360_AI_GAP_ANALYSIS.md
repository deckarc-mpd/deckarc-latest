# CP360 AI Gap Analysis

Compares the current repository state (`CP360_AI_PHASE0_DISCOVERY.md`) against the Frozen Architecture v4 (`docs/ai-brain/brain.txt`) and the AI Employee Identity spec (`docs/ai-brain/employeeidentity.txt`). Organized by frozen-architecture section. Each gap states **what's required**, **what exists**, **what's missing**, and **build-vs-reuse**.

---

## 1. Foundation Infrastructure (Frozen §6, §12, §23.4)

| Requirement | Current state | Gap | Build vs. reuse |
|---|---|---|---|
| One event/schedule/voice/Gmail/Calendar/Drive/human/API abstraction feeding ROUTE → SOP → WORKFLOW | Nothing. Each surface (voice, dashboard, tabs) talks straight to Supabase. | Full event abstraction + SOP registry + workflow persistence must be built. | Build new. Reuse `activity_log` table shape as a starting schema, extend rather than replace. |
| Universal Audit (event/workflow/agent-run/tool-call/approval/state-change/human-override/verification record types, correlated by `company_id`+`project_id`+`workflow_id`+`correlation_id`) | `activity_log` exists but only covers one record shape (actor, action_type, module, old/new value) with no `correlation_id`/`workflow_id`, and its INSERT policy trusts client-supplied actor fields (`WITH CHECK (true)`). No approval, tool-call, or verification record types exist anywhere. | Need: (a) new correlated audit schema/record types, (b) server-side-authoritative writes (not client-trusted), (c) `company_id` added everywhere (today only `organization_id` exists, and not on every row that would need auditing). | Build new tables; migrate `activity_log`'s existing writers onto the new schema rather than maintaining both. |
| Controlled Tools layer (agents never touch raw credentials/DB directly) | No tool abstraction. The two live Gemini features execute Supabase reads/writes directly from the browser (`executeDataTool`/`executeWriteTool` in `VoiceAssistant.tsx`). | Every AI-triggered read/write must go through a defined tool contract with logging, not ad hoc `supabase.from()` calls inlined in UI components. | Build new; wrap existing well-formed domain functions (`cascadeDelayFromTask`, the two data/write tool sets already enumerated in `voice-assistant.ts`) as the first controlled tools rather than rewriting their logic. |
| Policy / authority engine (per-agent/per-SOP permission + consequential-action confirmation) | Only ad hoc, per-feature gating exists: a hardcoded email check (`assistant.js`, `voice-assistant.ts`), a cosmetic `adminApprovalNeeded` flag (`AskCP360.tsx`) that blocks nothing, and a spoken yes/no confirm (`VoiceAssistant.tsx`) that blocks execution but isn't tied to any authority model or recorded anywhere. | One real policy engine keyed on stable agent/role IDs (not hardcoded emails) is needed before any agent gets write access beyond the current single-admin voice demo. | Build new. `VoiceAssistant.tsx`'s confirm/cancel UX pattern is worth generalizing as the UI-side contract for "consequential action needs confirmation," per §19 of the frozen architecture. |
| SOP/workflow registry usable by UI, scheduler, voice, email, API triggers uniformly | Does not exist. | Build new. | Build new — no existing analog. |

## 2. Agent Registry & Identity (Frozen §3, §4; Identity spec)

| Requirement | Current state | Gap |
|---|---|---|
| Agent Registry with stable IDs (`chief_of_staff`, `sales`, `estimating`, `project_operations`, `compliance`, `customer_success`) decoupled from display name | No agent concept exists in code or schema at all. | Net-new table + config. Low risk since nothing to migrate away from. |
| Display identity (Avery/Maya/Daniel/Marcus/Clara/Natalie) never hardcoded into business logic | N/A — no agent code exists yet to have this problem. | Enforce from day one of Phase 1: this is a design constraint on new code, not a fix to existing code. |
| Six frozen agents, each with an "Agent Creation Gate" justification before any new agent is added | N/A | Nothing to reconcile; just don't create a 7th without the ADR. |

## 3. Finance Architecture — Deterministic-First (Frozen §5)

| Requirement | Current state | Gap |
|---|---|---|
| Billing math, due dates, margin, cash projections deterministic; AI only for ambiguous interpretation | `PaymentsTab.tsx`/`ChangeOrdersTab.tsx` + `payment_milestones`/`change_orders` tables are fully deterministic CRUD today (no AI touches them) — actually **already compliant** with the "finance is not over-agentized" principle, simply because no AI exists there yet. | No gap to close for Phase 0/1. Flag for Phase 8 (Finance services): when AI is introduced here, it must stay confined to exception interpretation per the frozen rule, not be bolted onto the existing deterministic tabs as a general assistant. |
| No autonomous bank/payment movement | No payment processor is integrated at all (`IntegrationSettingsPage` marks Payments `Placeholder`). | None — already compliant by absence. |

## 4. Chief of Staff / Executive Compression (Frozen §8)

| Requirement | Current state | Gap |
|---|---|---|
| Deterministic event + rule layer produces "material exceptions" before any AI sees them | `alertUtils.ts` + `actionBoardHelpers.ts` compute alert colors and Action Board categories, but **only at render time**, not as a persisted, sweepable exception feed. Nothing currently distinguishes "material" from "routine" beyond a 3-tier color scheme. | Need a real exception-detection layer that runs on a schedule (see §6 below) and persists results, so a future Chief of Staff agent can be handed "5-10 things that matter" instead of raw table scans. |
| Chief of Staff never sees raw events | N/A — no Chief of Staff exists. | Design constraint for Phase 4, not a current violation. |

## 5. Integration Gateway — Gmail/Calendar/Drive (Frozen §9)

| Requirement | Current state | Gap |
|---|---|---|
| One shared Integration Gateway; CP360 owns OAuth/token storage; agents never hold raw credentials | **Zero Google integration exists** (Phase 0 Discovery §7). `IntegrationSettingsPage` shows Calendar as `Placeholder`; no Gmail or Drive rows exist at all in the UI's own integration list. | This is 100% new build: OAuth flow, token storage table (with encryption-at-rest expectations), scope management, connector health/sync-cursor/stale-data detection, per-agent/per-SOP read/write policy, normalized-event emission into the (also-not-yet-built) SOP/workflow engine. |
| One connector per integration, not one per agent | N/A — no connectors exist. | Design constraint from day one; low risk since there's nothing to consolidate. |
| External Gmail/Calendar/Drive state is supporting evidence; CP360 DB is canonical | No conflict today (nothing syncs). | See `ADR-CP360-AI-001_CANONICAL_SYSTEM.md` — decision must be recorded before any sync code is written so it isn't relitigated per-integration. |

## 6. Scheduled Operating Rhythm (Frozen §11, §20)

| Requirement | Current state | Gap |
|---|---|---|
| Deterministic sweeps first; AI only for exceptions; zero AI call if nothing material changed | No sweep mechanism of any kind exists (Phase 0 Discovery §6: no cron, no queue, no scheduled function). All "checks" are computed live, in-browser, only while a user has a page open. | Full scheduler is net-new. See `CP360_SCHEDULED_OPERATING_EVENTS.md` for the cadence table and the "existing job mechanism first" recommendation. |
| Company-configurable cadence/timezone/business calendar/holidays | `project_calendars` (per-project working-day flags) and `us_holidays` (seeded 2026–2027 US federal holidays) already exist as data and are already consumed by `scheduleEngine.ts`'s working-day math. | Good news: the data primitives partially exist. Gap is purely the *triggering* mechanism (nothing runs on a clock) and company-level (vs. project-level) timezone/cadence config, which doesn't exist yet. |
| Deduplicate against event-driven workflows | N/A — neither exists yet. | Design constraint for Phase 1/4 build, not a current defect. |

## 7. Universal Audit as P1 Foundation (Frozen §12)

Already covered under §1 above — restated because the frozen architecture explicitly ranks this above all agent work. **The single largest gap in the repository relative to the frozen architecture's own stated priority order** is that audit is currently the weakest piece (an unauthenticated-write activity feed) while the discovery shows product feature-work (schedules/tasks/permits/etc.) is the strongest piece. Implementation Plan sequencing must not repeat that inversion.

## 8. Cost Governance & Model Routing (Frozen §13, §14)

| Requirement | Current state | Gap |
|---|---|---|
| CODE → AI → HUMAN routing; AI never used for deterministic math/dates/permissions/state transitions | The two real AI features (`AskCP360`'s underlying logic is actually deterministic and mislabeled — no violation there) and the two Gemini-backed voice/chat features do not currently perform deterministic math via the LLM; they route data-fetch tool calls to real Supabase queries and only use the model for language/decision framing. **This part is already accidentally compliant.** | No correction needed to existing behavior. Constraint to preserve going forward: don't let future "AI Estimator"/"Finance AI" work regress this by asking the model to compute totals itself instead of calling a deterministic tool. |
| Per-agent/SOP/workflow/company AI cost measurement | No cost/token logging exists on either Gemini call today. | Build new: minimal cost-per-call logging is a Phase 1 audit-adjacent requirement, not deferred. |
| Provider-neutral model routing contract (not hardcoded to one vendor) | Both live AI features hardcode the Gemini REST endpoint and model string (`gemini-3.5-flash-lite`) directly in the serverless function. No abstraction layer. | When Phase 1 introduces the real model/execution router, these two functions are the first candidates to migrate onto it — not necessarily to change model choice, just to stop hardcoding the call. |

## 9. Cost-Control "Do Not Build" List (Frozen §14, §23.5)

Checked each item on the frozen list against the current repo — **the repo already contains none of the disallowed items** (no Kubernetes, no microservices, no per-agent runtime, no per-agent vector DB, no per-department event bus, no multiple queues, no data warehouse, no agent-to-agent chat infra, no separate voice business logic, no unrestricted SQL tool, no direct agent access to OAuth tokens — because no OAuth tokens exist yet). This is a **clean starting point**: Phase 1+ work has nothing over-built to unwind, only the discipline of not introducing any of these prematurely while building the (currently absent) foundation.

## 10. Voice Architecture (Frozen §19)

| Requirement | Current state | Gap |
|---|---|---|
| HEAR → TRANSCRIBE → resolve authenticated user/context → classify intent → read canonical state → propose structured action → policy/authority check → confirm if consequential → controlled tool → verify → speak → audit | `VoiceAssistant.tsx`/`voice-assistant.ts` already implements a *recognizable partial version* of this loop: browser STT → Gemini function-calling for intent → direct Supabase read/write ("controlled tool" stand-in) → spoken yes/no confirm for writes → TTS. **Missing**: authenticated-session-based authorization (currently a client-supplied email string, not a verified session — Phase 0 Discovery risk #2), real policy/authority engine, verification step, and audit trail. No separate voice business logic exists to consolidate (Frozen §14 rule already satisfied — voice calls the same Supabase tables the rest of the app uses, it just isn't routed through the not-yet-built SOP/tool layer). | Harden auth on the existing endpoint, then re-platform its tool-calls onto the real Controlled Tools + Policy + Audit layers once they exist, rather than building a second voice stack. |
| Multi-user, multi-role voice (per Identity spec: "Ask Marcus...", "Ask Natalie...") | Single hardcoded admin user only. | Requires both the Agent Registry (to resolve names → agent IDs) and generalized per-user authorization (removing the hardcoded-email gate) — sequenced together, since generalizing auth without an agent/policy model to check against would be premature. |

## 11. UX Simplicity — Command Center / Action Center (Frozen §17–18)

| Requirement | Current state | Gap |
|---|---|---|
| One Command Center, one Action Center, project intelligence inside normal project screens | `DashboardPage`, `ActionBoardPage`, and `ProjectPulse.tsx` already exist and already implement a "Needs My Decision / Critical / AI Handling / Watching / Completed / Blocked"-*adjacent* categorization (`getCriticalItems`/`getNeedsReviewItems`/`getAdminNeedsAttentionItems` in `actionBoardHelpers.ts` use `critical`/`needs-review` categories today). This is meaningfully close to the frozen §18 Action Center queue model already. | Gap is nomenclature/category-completeness (no `AI Handling`/`Watching` category exists — everything is either open or done today, no "system is on it" state — because no agent is doing anything yet) and the fact these are pure DB-state derivations, not fed by an actual agent/workflow layer. Reuse the existing helper module; extend its category enum rather than replacing the Action Board. |

## 12. Priority/Phase Alignment Check (Frozen §21–22)

The frozen priority order is **P0 inspect → P1 audit/event/SOP/tools/policy → P2 Project Ops → P3 trade/material → P4 scheduled rhythm/CoS/Action Center → P5 Customer Success → P6 Voice → P7 Compliance → P8 Finance → P9 Sales/Estimator → P10 L4 autonomy → P11 multi-company**.

Mapped against what already exists:
- **P2 (Project Ops field update/readiness) has substantial existing UI/data** (Tasks, Daily Updates, Phase Readiness, Crew Confirmations, Schedule Change Log) — but zero of it is agent- or workflow-driven yet. P2 work is "wire existing screens to new SOPs," not "build new screens."
- **P6 (Voice) has a partial prototype already** (§10 above), materially ahead of P1's foundation in raw feature terms — this is a trap: the existing voice demo must **not** be extended further before P1 foundation exists, per the frozen architecture's own gate. Recommendation carried into the Implementation Plan: freeze `VoiceAssistant`/`voice-assistant.ts` as-is (bug-fix only, e.g. the auth issue) until Controlled Tools + Policy + Audit exist, then re-platform it.
- **P7 (Compliance) has strong existing data model** (Permits, Inspections, `ProjectInspectionRequirement` ordering/prerequisites) but, like P2, no agent/SOP layer.
- **P8 (Finance) is intentionally the least AI-touched area today**, which matches the frozen architecture's own "deliberately not over-agentized" stance — nothing to correct.
- **P9 (Sales/Estimator)**: `CP360LeadsPage`/`cp360_leads` table exists as a marketing-lead intake surface but has no AI qualification/follow-up logic — consistent with P9 being late in sequence.
- **P11 (multi-company)**: the `organizations`/tenant schema already anticipates this (Phase 0 Discovery §4), but RLS breadth (`USING (true)` on several tables) means **the schema is ready for multi-company sooner than the security model is** — flagged as a P1-adjacent prerequisite, not a P11-only concern, because any scheduled sweep or agent that reads "all projects" needs correct org scoping from day one or it will leak across tenants the moment a second real company is onboarded.

## 13. Summary — Top 5 Gaps to Close First

1. **No audit foundation** (client-trusted writes, no correlation IDs, no tool/approval/verification record types) — blocks everything else per the frozen architecture's own gate.
2. **No event/SOP/workflow abstraction** — every "automation" today is synchronous and UI-triggered; nothing can run without a human having a browser tab open.
3. **No scheduler of any kind** — the entire Scheduled Operating Rhythm section of the frozen architecture has zero infrastructure to extend.
4. **No Integration Gateway / Google OAuth** — Gmail/Calendar/Drive are UI placeholders only.
5. **RLS/org-scoping breadth** — several tables grant broad authenticated read access rather than strict org filtering; safe today with one real tenant, a real risk the moment a scheduler or agent starts reading "everything" across a second company, or the moment multi-company Product (P11) actually onboards a second org.

None of these are contradicted by anything in the codebase — they are simply absent. This is a clean, additive build, not a migration away from a conflicting prior architecture.
