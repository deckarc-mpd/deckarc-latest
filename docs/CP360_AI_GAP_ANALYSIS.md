# CP360 AI Gap Analysis

**Phase:** P0 (Discovery). No implementation performed.
**References:** `docs/ai-brain/brain.txt` §§6–24 (frozen architecture), `docs/ai-brain/employeeidentity.txt` (naming rules), `CP360_AI_PHASE0_DISCOVERY.md` (source of all "current state" claims below — see it for file-level evidence).

Severity key: **Blocking** = cannot start P1 without it · **High** = required within P1 · **Medium** = required by the phase that needs it · **Low** = deferrable / config-only.

## 1. Agent Registry & Employee Identity

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| One Agent Registry; stable `agent_id` per employee (`chief_of_staff`, `sales`, `estimating`, `project_operations`, `compliance`, `customer_success`); display name/title separate from technical identity (employeeidentity.txt §3) | No agent concept exists anywhere in the codebase. No table, no config, no `agent_id` field anywhere. | Full build: registry table/config with the metadata shape in employeeidentity.txt §4 (Agent ID, Display Name, Title, Domain, Mission, Responsibilities, Assigned SOPs, Allowed Tools, Data Permissions, Authority Level, Escalation Policy, Model Policy, Cost Budget, Status, Version). | Blocking (P1) |
| No business logic keyed on display name (employeeidentity.txt §3) | N/A — no agent logic exists yet to violate this | Must be enforced from day one of P1, not retrofitted | High |
| Audit records stable `agent_id` + display name/title-at-execution-time (employeeidentity.txt §7) | `activity_log` has no agent concept at all | Depends on both Agent Registry and Audit gaps below | Blocking (P1) |

## 2. Universal Audit (brain.txt §12)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| Correlated audit records across company_id + project_id + workflow_id + correlation_id | `activity_log` has `project_id` and `user_id` only — no `company_id`, no `workflow_id`, no `correlation_id` | Add columns; backfill strategy for existing rows (or accept them as pre-audit-era history) | Blocking (P1) |
| Distinct record types: Event, Workflow run, Agent run, Tool call, Approval, State change, Human override, Verification | Single flat `action_type`/`module` free-text pair; no type discriminator, no per-type minimum-fields schema | Design correlated-but-typed audit tables (or one table + a `record_type` enum + JSONB payload, per brain.txt "not necessarily one giant table") | Blocking (P1) |
| Audit exists before meaningful autonomous writes | Existing AI surfaces (`AskCP360`, `api/assistant.js`, `api/voice-assistant.ts`) perform reads and even writes (`create_project`, `update_task_status` in the voice function) with **zero** audit trail today | Any AI write path must be gated behind the new audit system before P1 exit, and the existing unaudited write path in `api/voice-assistant.ts` should not go further into production use until then | Blocking (P1) |
| Reuse existing DB unless measured volume justifies specialized storage | Supabase Postgres already in use; no volume data exists to justify anything else | Satisfied by default — extend `activity_log` / add sibling tables in the same Postgres instance | None (comply by default) |

## 3. Event Abstraction & SOP/Workflow Engine (brain.txt §6, §11, §23.4)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| One event abstraction/fabric for Events/Schedules/Voice/Gmail/Calendar/Drive/Human/API, routed → SOP → Workflow | No event abstraction of any kind. Actions are direct Supabase calls from React components with no intermediating event or workflow concept | Full build. Use "existing application event/job mechanism first" — since none exists, the leanest compliant option is a Postgres table (`events`) + application-level dispatcher, not a broker | Blocking (P1) |
| One SOP/workflow system for UI, scheduler, voice, email, and API triggers | No SOP/workflow persistence exists. The closest analog is the informally-documented "CP360 Operating Loop" (`OperatingLoopCard.tsx`), which is UI copy, not executable workflow state | Full build: `workflow_runs` (or similar) table + a minimal state-machine runner usable from any trigger source | Blocking (P1) |
| Workflow state in existing DB unless current stack provides durable workflow infra | No durable workflow infra exists (confirmed: no Temporal/queue/etc.) | Comply by default — Postgres-backed workflow state, no new infra | None (comply by default) |

## 4. Controlled Tools & Policy/Authority Engine (brain.txt §6, §7, §19)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| All AI/human/voice/scheduler actions pass through a Controlled Tools layer | No such layer. Every write today is a direct `supabase.from(...).insert/update()` call from frontend code, secured only by RLS | Full build: server-side (Edge Function or serverless) tool-execution layer that wraps existing Supabase operations behind named, typed tools | Blocking (P1) |
| One policy/authority engine deciding CODE vs AI vs HUMAN and gating consequential actions behind explicit confirmation | `api/voice-assistant.ts`'s `DATA_TOOLS`/`WRITE_TOOLS` split is a **real but informal, single-function-scoped** precedent — not reusable as-is (client-executes-tool pattern, no policy table, no role awareness) | Formalize as a real policy engine (authority levels, per-role/per-agent permission checks) rather than extending the ad hoc set-membership check in `voice-assistant.ts` | Blocking (P1) |
| Approvals recorded with exact payload hash/version, approver, decision, channel, timestamp | No approval concept exists. `schedule_change_requests` and `action_items.admin_approval_required` are the closest **domain-specific** analogs (human approval of schedule delays / flagged action items) but are not a general-purpose approval primitive | Build a general `approvals` construct; consider whether `schedule_change_requests` becomes a consumer of it rather than a parallel mechanism | High (P1) |
| Feature flags | None exist in the codebase (no flag table, no flag library dependency in `package.json`) | Add a minimal flags table/mechanism — needed to gate the AI surface rollout safely per brain.txt's phase-gate discipline | High (P1) |

## 5. Integration Gateway — Gmail / Calendar / Drive (brain.txt §9)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| One shared Integration Gateway for Gmail/Calendar/Drive; CP360 owns OAuth/token storage; agents never hold raw credentials | **Nothing exists.** No OAuth flow, no token table, no Google API client dependency, no connector code. `IntegrationSettingsPage.tsx` lists Calendar as "Placeholder"; Gmail/Drive aren't even listed. | Full greenfield build: OAuth flow (per-organization), encrypted token storage table, one server-side connector layer, normalized-event emission into the (also-not-yet-built) event abstraction | Blocking (P6/voice needs it later, but Compliance/Customer Success/Sales workflows in P3–P9 need it sooner — see Implementation Plan) |
| Connector health, sync cursor, stale-data detection, idempotency, reconcile-before-retry | N/A — no connector exists | Design in from the start; nothing to retrofit | High |
| External Gmail/Calendar/Drive state is supporting evidence; CP360 remains canonical | No conflict yet since no integration exists — but must be decided explicitly before build begins (see ADR-001) | Documented in ADR-CP360-AI-001 | Resolved by ADR |

## 6. Knowledge Brain (brain.txt §10)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| One governed Knowledge Brain (project history, vendor history, company SOPs, estimate history, jurisdictions, lessons learned), scoped retrieval, no per-agent vector DB | No knowledge layer exists. Canonical facts already live correctly in domain tables (`projects`, `tasks`, `permits`, etc.) — brain.txt explicitly wants this ("canonical facts belong in CP360 domain tables"), so this part is **already compliant by construction**, just not yet exposed via a retrieval interface | Build a thin, scoped retrieval interface over existing tables + a lightweight `knowledge_items` table (source, date/version, scope, review status) for durable non-transactional knowledge (lessons learned, SOP text) that doesn't fit a domain table | Medium (needed starting P2–P3, matures through P9's Estimator) |

## 7. Chief of Staff — Executive Compression (brain.txt §8)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| Chief of Staff receives resolved exceptions, not raw events | `actionBoardHelpers.ts` (`getAdminNeedsAttentionItems`) already performs deterministic exception compression across 6 domains into a single prioritized list — **this is most of the deterministic pre-filter Avery needs**, it just isn't wired to an AI synthesis step or scoped as "Chief of Staff input" | Wrap existing helper output as the Chief of Staff's input contract; add the AI synthesis layer on top (P4) | Medium (P4) |

## 8. Scheduled Operating Rhythm (brain.txt §11, §20)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| Deterministic sweeps first; scheduled triggers via existing scheduler/background-job mechanism; company-timezone-configurable; zero AI call when nothing changed | **No scheduler/cron/background-job mechanism of any kind exists** (confirmed: no `pg_cron`, no Supabase scheduled functions, no Vercel Cron config) | Full build — see `CP360_SCHEDULED_OPERATING_EVENTS.md` for the concrete leanest-option recommendation (Supabase `pg_cron` extension or Vercel Cron hitting a serverless endpoint) | Blocking (P4, but P1's audit/workflow foundation should anticipate scheduler-sourced events) |

## 9. Finance Determinism (brain.txt §5)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| Billing/margin/cash-forecast math deterministic; Finance starts as services/SOPs, not an agent | `payment_milestones` and `change_orders` exist as data tables with manually-entered/derived fields (`days_overdue`, `work_hold_required`) but there is **no billing engine, no margin engine, no cash-forecast engine, no AP workflow, no collections SOP** — Finance is currently pure CRUD with no calculation layer at all | Build the deterministic Finance services described in brain.txt §5 (Billing Service, AP Workflow, Collections SOP, Margin Engine, Cost Tracking, Cash Forecast Engine) — none exist to extend | High (P8; no conflict to resolve since nothing exists to over-agentize) |

## 10. Cost Governance & Model Routing (brain.txt §13, §16)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---|---|
| Provider-neutral model routing contract; per-workflow/per-company AI cost measurement | Existing AI calls (`api/assistant.js`, `api/voice-assistant.ts`) hardcode `gemini-3.5-flash-lite` directly in the function body — no routing abstraction, no cost logging, no per-call metadata capture | Build minimal model-routing contract + cost-logging hook before any new agent call ships | High (P1, before first real agent call) |
| Metrics: workflow success rate, human edit/rejection rate, false/missed exception rate, duplicate action rate, tool/connector failure rate, AI cost per SOP/workflow, cost per company/project, model/provider usage, voice minutes/cost, time saved | None of these are tracked anywhere today | Depends on Audit + Event abstraction existing first; instrument incrementally as each phase ships | Medium (grows through P1–P10) |

## 11. Two-Way Voice (brain.txt §19)

| Frozen requirement | Current state | Gap | Severity |
|---|---|---| ---|
| Voice uses identical SOPs/tools/policies as non-voice; authenticated session required; no separate voice business logic | `AdminVoiceAssistant.tsx` + `api/voice-assistant.ts` is a real, working voice loop (STT → Gemini w/ tool-calling → TTS) but it is entirely **separate business logic** — its own tool set, its own auth gate (hardcoded email, not the frozen architecture's authenticated-session-plus-authority model), no audit, no confirmation-read-back for amounts/dates | This is explicitly the anti-pattern brain.txt §14 forbids ("Separate voice business logic — Never; voice must invoke the same SOPs/tools/policies"). Do not extend it; once P1's Controlled Tools/Policy layer exists, voice must be re-pointed at the same layer non-voice UI uses (P6), and the current bespoke implementation retired or reduced to a thin transport adapter | High (flagged now, resolved in P6) |

## 12. "Do Not Build" Compliance Check (brain.txt §14, §23.5)

Current repo already complies with every item on the Do-Not-Build list, by virtue of not having built any of it: no Kubernetes, no microservices, no per-agent runtime, no per-agent vector DB, no department event bus, no per-agent queues, no data warehouse, no agent-to-agent chat infra, no separate voice business-logic *engine* (though the voice assistant's ad hoc logic is a smaller-scale echo of this anti-pattern, per §11 above), no unrestricted SQL tool for any model, no direct agent access to OAuth tokens (none exist yet to misuse), no LLM used for deterministic math. **The only real violation risk is architectural drift if the existing `api/voice-assistant.ts` pattern (client-executed tools, hardcoded auth) is extended rather than replaced.**

## 13. Summary — What's Genuinely Reusable vs. Greenfield

**Reusable now (extend, don't replace):** `activity_log` (extend schema), `action_items` + `actionBoardHelpers.ts` (wrap as Chief of Staff input), `scheduleEngine.ts` + `alertUtils.ts` (CODE-tier controlled tools), `user_consents` (AI consent), `fileUpload.ts`/`project_files` (document storage pattern), RLS-based tenant/role model (extend, don't replace).

**Greenfield (nothing to extend, build clean from P1 principles):** Agent Registry, Event abstraction, SOP/Workflow engine, Controlled Tools layer, Policy/Authority engine, Approvals (general-purpose), Universal Audit (typed records), Integration Gateway (Gmail/Calendar/Drive), Knowledge Brain retrieval interface, Scheduler/cron, Finance deterministic services, Feature flags, Model-routing/cost-logging contract.

**Retire or formally replace (do not extend as-is):** `AskCP360.tsx`'s fake-AI mock, the hardcoded-single-email auth gate in `api/assistant.js` and `api/voice-assistant.ts`, `api/voice-assistant.ts`'s client-executed tool pattern once the real Controlled Tools layer exists.
