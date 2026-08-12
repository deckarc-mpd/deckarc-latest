# CP360 AI Phase 0 — Discovery

**Status:** Complete
**Phase:** P0 (Inspection only — no implementation code written or modified)
**Date:** 2026-08-12
**References:** `docs/ai-brain/brain.txt` (CP360 AI Operations Brain — Frozen Architecture v4, full detail) and `docs/ai-brain/employeeidentity.txt` (approved AI employee naming rules). This document does not restate either in full; read them for authoritative detail.

## 0. Purpose and Method

Per the frozen architecture's Phase 0 requirement (brain.txt §23.1) and the execution prompt's Phase Gate rule, this document inspects the **existing** CP360 repository (`deckarc-mpd/deckarc-latest`) before any AI implementation work begins. It covers application architecture, existing modules, integrations, security, deployment, audit, reusable components, technical debt, and risks. No unrelated code was refactored and no implementation code was written during this inspection.

Inspection covered: `package.json`/build config, `src/` (frontend), `api/` (serverless functions), `supabase/migrations/*.sql` (69 migration files, ~6,550 lines), `supabase/functions/` (2 Edge Functions), `vercel.json`, `.bolt/prompt`, and `AI_ASSISTANT_SETUP.md`.

## 1. Executive Summary

CP360 today is a **single-tenant-shaped, multi-tenant-capable** construction operations SPA: React/TypeScript frontend, Supabase Postgres as the only database, Supabase Auth for identity, Supabase Storage for files, and two small Vercel serverless functions bolted on for an experimental admin-only AI chat/voice widget. There is **no** SOP/workflow engine, **no** event abstraction, **no** scheduler/cron, **no** Universal Audit system, **no** policy/authority engine, **no** Agent Registry, and **no** real Gmail/Calendar/Drive integration — all of which are P1+ requirements in the frozen architecture. This is expected for a pre-AI-initiative codebase and is the primary input to `CP360_AI_GAP_ANALYSIS.md`.

The good news for the "lean infrastructure" mandate (brain.txt §14–16): CP360 is *already* a modular monolith with no accidental complexity to unwind. There is no Kubernetes, no microservices, no message broker, no vector database, and no per-agent anything to rip out. The frozen architecture's constraints are trivially satisfiable by extending what exists rather than replacing it.

The concerning news: there are already **three independent, inconsistent AI implementations** in the codebase (deterministic mock, two different real-Gemini-backed functions with divergent authorization and tool patterns), none of which write to an audit trail, none of which use Claude/Anthropic, and one of which is gated by a single hardcoded test email rather than a role or permission. These must be consolidated, not extended in place, when P1 begins.

## 2. Application Architecture

### 2.1 Frontend
- **Stack:** Vite 5 + React 18 + TypeScript 5, Tailwind CSS 3. Originally scaffolded via Bolt.new (`.bolt/config.json` → `bolt-vite-react-ts` template; `.bolt/prompt` contains the original CP360 product brief).
- **Routing:** No router library (no `react-router`). `src/App.tsx` is a single `AppContent` component that holds `currentPage` in React state and switches on a `Page` union type (defined identically in `src/components/Layout.tsx` and re-exported). Navigation is a large `switch` in `renderContent()` plus a set of role-based route guards (e.g. `CONVAZANT_BLOCKED_OUTSIDE_WORKSPACE`, client page blocklist). There is no deep-linking / URL-based navigation except one hardcoded public path (`/founding-pilot`).
- **Nav model:** `src/components/Layout.tsx` defines five distinct nav item lists (`convazantNavItems`, `adminNavItems`, `gcNavItems`, `subNavItems`, `clientNavItems`), each with its own grouping map. Navigation structure is hardcoded per role, not driven by configuration — relevant to the "one Agent Registry, no hardcoded business logic by agent name" principle the frozen architecture demands for agents (brain.txt §23.4); the nav layer shows the codebase's default pattern *is* to hardcode per-role UI rather than externalize it to config, which is a style Phase 1+ work should deliberately avoid repeating for agent/SOP logic.
- **~40 page components** under `src/pages/`, **~35 project-tab components** under `src/components/project/` (one per domain sub-feature: tasks, permits, inspections, change orders, materials, RFIs, punch list, closeout, crew confirmations, weather risks, daily updates, activity log, communication hub, etc.).
- **State/data access:** No global state library (Redux/Zustand/etc.). Each page/component calls `supabase.from(...)` directly via the shared client in `src/lib/supabase.ts`. Domain types (Project, Task, Permit, Inspection, ChangeOrder, PaymentMilestone, Material, Incident, RFI, PhotoLog, PunchListItem, CommunicationLog, ActivityLog, ActionItemRecord, TaskResponse, etc.) are hand-defined TypeScript interfaces co-located in `supabase.ts` — there is no generated types file (`supabase gen types`) and no ORM.

### 2.2 Backend
- **No standalone backend server.** All server-side logic lives in two places:
  1. **Supabase** — Postgres (schema + Row Level Security), Auth, Storage, and 2 Edge Functions (`supabase/functions/seed-test-users`, `supabase/functions/test-login`) that exist purely for test-account provisioning/QA, not product logic.
  2. **Vercel Serverless Functions** — `api/assistant.js` (Node runtime) and `api/voice-assistant.ts` (Edge runtime), both implementing the experimental AI assistant described in §5 below.
- There is no queue, no background worker process, no cron, no message bus. All writes happen synchronously from the browser via the Supabase client SDK, protected by Row Level Security (RLS) policies rather than a server-side authorization layer.

### 2.3 Deployment Topology
- **Hosting:** Vercel (`vercel.json`: Vite build, static `dist/` output, `/api/*` rewritten to serverless functions, SPA fallback to `index.html`).
- **Database/Auth/Storage:** Supabase (hosted Postgres + GoTrue auth + Storage buckets).
- **Environments:** No `.env` files are committed (`.gitignore` excludes `.env*` and `.vercel`); environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for Edge Functions, `ADMIN_ASSISTANT_EMAIL`) are configured directly in Vercel/Supabase project settings per `AI_ASSISTANT_SETUP.md`.
- No containers, no Kubernetes, no infrastructure-as-code files (no Terraform/Pulumi/CDK) were found. Deployment is push-to-deploy via Vercel's Git integration.

This confirms the frozen architecture's Recommended Lean Physical Deployment (brain.txt §15, Figure 10) is not a hypothetical simplification — it is very close to CP360's actual current shape already: one frontend, one backend surface (Supabase + a couple of serverless functions), one database. Domain services, AI/SOP workflows, and an Integration Gateway can all be added as **logical modules inside this same surface** (new tables + new Edge/serverless functions) without introducing new deployables.

## 3. Auth, Tenant, and Role Model

- **Identity:** Supabase Auth (`auth.users`), extended by `user_profiles` (1:1 via `id` FK), which is where `role` and `organization_id` live. `src/contexts/AuthContext.tsx` wraps session + profile fetch/refresh.
- **Roles (`UserRole` in `src/lib/supabase.ts`):** `CONVAZANT_SUPER_ADMIN`, `DECKARC_ADMIN`, `GENERAL_CONTRACTOR`, `SUBCONTRACTOR`, `CLIENT`. (`alertUtils.ts` also has label mappings for `PROJECT_MANAGER`, `VENDOR`, `SUPPLIER`, suggesting future role expansion was anticipated but not yet implemented anywhere else.)
- **Tenant model:** `organizations` table (id, name, type, status, workspace_status, plan, service_area, business_type, organization_type, etc. — extended in the `script6_organizations_enhanced` migration). CONVAZANT INC is seeded as `organization_type = 'Platform Owner'`; DECKARC LLC is seeded as `organization_type = 'Contractor Company'`. `user_profiles.organization_id` scopes each user to one org.
- **Multi-company posture today:** The data model is genuinely multi-tenant-capable (org-scoped projects, org-scoped file storage paths, a `CONVAZANT_SUPER_ADMIN` role that can "Enter Workspace" for any org — see `ConvazantDashboardPage.tsx` / `App.tsx`'s `convazantInWorkspace` state). However, **UI and business logic are not yet organization-configurable** — nav items, scheduled-event cadence (none exists yet), and role labels are hardcoded, not read from `organizations` config. This is the concrete gap P11 (multi-company productization) will need to close, and it's useful context for P0's "canonical data/tool map."
- **Consent:** `user_consents` table + `ConsentPage.tsx` already implements a versioned consent-acceptance flow (`CONSENT_VERSION` constant, gate in `App.tsx`), which is a reusable pattern for any future AI-specific consent/disclosure requirement.
- **Client-safe views:** `ClientProjectDetailPage`, `ClientProjectsPage`, and an admin **"preview as client"** mode (`ClientPortalPreview.tsx`, `ClientPreviewContext.tsx`) already establish the precedent of a role-scoped, filtered view of canonical data — directly relevant to how AI-generated client communications should be scoped (Customer Success / Natalie's domain).

## 4. Database and Canonical Data Map

Postgres via Supabase. **69 migrations**, **~50 tables**, **213 `CREATE POLICY` statements** (RLS is used pervasively and is the primary authorization mechanism — there is no separate server-side authorization layer to add policy checks to; a future Policy/Authority engine will need to either extend RLS or sit in front of it for AI-initiated writes).

Table inventory by domain (table name → migration of origin):

| Domain | Tables |
|---|---|
| Identity/Tenant | `organizations`, `user_profiles`, `user_consents`, `user_invitations`, `access_requests`, `workspace_requests`, `pending_invites` |
| Projects/Tasks | `projects`, `project_users`, `tasks`, `task_responses`, `schedule_change_requests`, `schedule_change_log`, `project_calendars`, `us_holidays` |
| Field/Daily Ops | `daily_updates`, `weather_risks`, `crew_confirmations` |
| Compliance | `permits`, `inspections`, `project_inspection_requirements` |
| Client-Facing | `client_decisions`, `communication_messages`, `communication_log` |
| Finance | `change_orders`, `payment_milestones` |
| Materials/Field Risk | `materials`, `incidents`, `rfis`, `photo_logs`, `punch_list_items` |
| Project Lifecycle | `phase_checklists`, `project_closeout_checklists`, `weekly_health_reports` |
| Files | `project_files` (+ Supabase Storage bucket `project-files`) |
| Ops/Alerts | `action_items`, `activity_log`, `alert_reads`, `notifications`, `notification_preferences` |
| Existing AI | `ai_reports` |
| Leads/Marketing | `cp360_leads` |
| Internal R&D | `customer_discovery_sessions`, `customer_discovery_observations`, `customer_discovery_feature_requests`, `customer_discovery_activities` |
| Archive/Governance | `archive_requests` |
| Delay Tracking | `project_delay_reasons` |

Every table has RLS enabled; policies are consistently role-gated (`user_profiles.role IN (...)`) or ownership-gated (`user_id = auth.uid()` / `project_users` membership). This is a solid foundation: an AI-initiated write can inherit the same RLS posture as a human-initiated write **if** it executes through a service identity or the acting user's own session — a decision the Controlled Tools layer (P1) must make explicitly (see `CP360_AI_GAP_ANALYSIS.md`).

## 5. Existing AI Surface (Critical Finding)

CP360 already contains **three separate, non-interoperating AI implementations**. None of them are Claude/Anthropic-based; all reference Google Gemini. None write to `activity_log` or any audit table. None are wired to the frozen architecture's controlled-tools/policy/audit chain. This is the most important discovery for Phase 1 planning.

1. **`src/components/AskCP360.tsx`** — "Ask CP360" panel embedded on most pages. Despite being labeled an AI assistant, `generateAIResponse()` is a **pure deterministic keyword-matching function** — it fetches a little live Supabase context (projects/tasks/open action items) and then branches on `query.toLowerCase().includes(...)` to return a canned answer shape (`answer`, `reason`, `recommendedAction`, `confidence`, `missingInfo`, `adminApprovalNeeded`). No LLM is called. `IntegrationSettingsPage.tsx` explicitly lists "AI Assistant" as `status: 'Simulated'` with the note *"Configure an AI provider (e.g., Anthropic, OpenAI) for live responses."* — i.e., the codebase itself flags this as a placeholder.
2. **`api/assistant.js`** (Vercel Node function) — Real Gemini (`gemini-3.5-flash-lite`) call. Gated to a single hardcoded email (`deckarc.admin@test.com`, overridable via `ADMIN_ASSISTANT_EMAIL` env var), verified server-side via the caller's Supabase access token. General platform Q&A only — no tool calls, no live data access, no writes. Backs `src/components/AdminVoiceAssistant.tsx` (STT via browser `SpeechRecognition`, TTS via browser `speechSynthesis`, both free/client-side).
3. **`api/voice-assistant.ts`** (Vercel Edge function) — Also Gemini, but implements real **function-calling**: `TOOLS` array with `navigate`, `query_projects`, `query_tasks`, `query_action_items`, `query_permits` (read-only, auto-executed, data fetched by the *frontend* and sent back to the model in a second round-trip) and `create_project`, `update_task_status` (writes, explicitly split into a `WRITE_TOOLS` set that returns a `confirm` payload instead of executing — the frontend must get explicit user confirmation before calling Supabase). **This is the closest existing precedent to the frozen architecture's CODE→AI→HUMAN routing and Controlled Tools + human-approval pattern** (brain.txt §7, §19), and should be treated as a reusable design reference for P1's approval workflow — but it currently: (a) authorizes via a single hardcoded admin email rather than role/permission, (b) executes tool data-fetches client-side rather than through a server-side controlled-tool layer, (c) has no audit trail, (d) has no correlation/workflow IDs, and (e) is wired to only one page/company. It is a prototype, not infrastructure to extend as-is — see the Gap Analysis for the consolidation recommendation.
4. **`src/components/customerDiscovery/aiSummary.ts`** — a fourth, unrelated "AI summary" generator, but it is explicitly documented as **not calling any external AI API** ("Deterministic mock AI summary generator... assembles a readable narrative from the stored session fields"). It's internal-tooling-only (Customer Discovery / demo-session notes) and out of scope for the AI workforce, but worth noting so it isn't confused with a real integration point.
5. **`ai_reports` table** — exists in schema (`report_type`, `report_text`, `created_by_user_id`) but no code path writes to it currently (no `INSERT` found against `ai_reports` outside RLS policy definitions). It's a stub table from an earlier, unfinished feature — a candidate for reuse or removal during P1 rather than a live feature.

## 6. Integrations (Gmail / Calendar / Drive / Everything Else)

**Finding: none of Gmail, Google Calendar, or Google Drive integration exists in this codebase in any form.** No OAuth client code, no token storage columns/tables, no Google API SDK dependency in `package.json`, no calendar sync logic, no email-sending code beyond a "Simulated" label.

`src/pages/IntegrationSettingsPage.tsx` is the authoritative existing statement of integration status — it is a static, hardcoded array (`INTEGRATIONS`) rendered for admins, all buttons disabled ("Configure — Admin Only"):

| Integration | Status in repo | Note in repo |
|---|---|---|
| Email Notifications | Simulated | "Configure SMTP or SendGrid for production" |
| SMS Notifications | Simulated | "Configure Twilio or a similar provider" |
| AI Assistant | Simulated | "Configure an AI provider (e.g., Anthropic, OpenAI)" |
| Weather API | Placeholder | Manual entry only |
| **Calendar Sync** | **Placeholder** | **"Configure Google Calendar or Outlook Calendar for production"** |
| QuickBooks | Placeholder | Future SaaS readiness |
| Payment Processing | Placeholder | "Configure Stripe or similar" |
| File Storage | Simulated (label is stale) | Actually real — see §7 |
| Permit/Inspection Portal | Placeholder | Manual entry + link tracking |

Gmail is not listed at all. This means the Integration Gateway (brain.txt §9) is a **greenfield build within the lean-monolith boundary**, not an extension of existing connector code — there is nothing to consolidate away from, which simplifies P1 scoping but means the full OAuth/token-storage/sync-cursor/idempotency surface described in brain.txt §9 must be designed from scratch.

## 7. File Storage (Real, Working)

Unlike the "Simulated" label in Integration Settings suggests, file storage is real and reasonably well-built: `src/lib/fileUpload.ts` uses Supabase Storage bucket `project-files`, paths scoped `{organization_id}/{project_id}/{timestamp}_{filename}` (RLS-enforceable prefix pattern), signed URLs (7-day for upload confirmation, 2-hour for viewing), and inserts metadata into `project_files` with `client_visible`/`internal_only` flags defaulting to internal-only until explicitly approved. Two dedicated migrations (`phase5_file_vault_storage`, `security_hardening_storage_rls`) harden bucket-level RLS. This is a solid, reusable pattern for how any future Drive-sourced or AI-generated documents should be stored and access-controlled.

## 8. Scheduler / Background Jobs

**None exist.** No `pg_cron` extension usage, no Supabase scheduled Edge Functions, no Vercel Cron config in `vercel.json`, no external job runner. Every "schedule" reference in the codebase (`schedule_change_requests`, `schedule_change_log`, `scheduleEngine.ts`) refers to **construction project scheduling** (task dates/dependencies), not a job/task scheduler. The frozen architecture's entire Scheduled Operating Rhythm (brain.txt §11, §20) is new build — see `CP360_SCHEDULED_OPERATING_EVENTS.md`.

## 9. Audit

**No Universal Audit system exists.** The closest analog is `activity_log`:

```
activity_log: id, project_id, user_id, user_full_name, user_role, action_type,
              module, related_record_id, related_record_type, old_value,
              new_value, notes, created_at
```

This captures a single flat "what changed" record per action, written ad hoc from application code wherever a developer remembered to call it (e.g. `scheduleEngine.ts`'s `cascadeDelayFromTask()` writes one `activity_log` row per cascaded task). It has no `correlation_id`, no `workflow_id`, no `company_id` column, no distinct record types for Event/Workflow run/Agent run/Tool call/Approval/Verification (brain.txt §12's required audit record types), and no replay capability. RLS restricts read access to admins and the acting user. **This table is a reasonable foundation to extend, not a system to build fresh** — but it cannot serve as the Universal Audit store in its current shape; it needs the correlation/workflow/record-type columns the frozen architecture requires before any autonomous AI write is allowed to depend on it (brain.txt §12: "Audit is P1 and must exist before meaningful autonomous writes").

## 10. Security Posture

- **RLS-first authorization.** 213 policies is the primary access-control mechanism; there is no separate server-side authz middleware for most of the app (the two Vercel functions are the sole exception, and only because they need to hide the Gemini API key).
- **Secrets:** No secrets committed to the repo (`.gitignore` covers `.env*`, `.vercel`). Server-only secrets (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are confined to Vercel/Supabase env config and never referenced from `src/` (frontend bundle). This is exactly the pattern brain.txt requires for future AI provider keys and Google OAuth tokens ("agents never hold raw Google credentials").
- **Single hardcoded-email gate** in the two AI assistant functions (`deckarc.admin@test.com`) is a shortcut that will not survive multi-company productization (P11) or even a second DeckArc admin user — it should become a role/permission check in P1, not later.
- **Storage RLS hardening** exists as two dedicated migrations, suggesting the team has already had to retrofit storage security once — a signal to get AI-related RLS/policy design right the first time rather than iterating in production.
- No rate limiting, no WAF, no dependency-scanning config, no CSP headers were found configured at the Vercel/app level — out of scope for Phase 0 AI discovery but worth flagging as general technical debt.

## 11. Reusable Components (candidates for "Controlled Tools" / SOP building blocks)

These existing, working pieces of deterministic logic are strong candidates to become the first Controlled Tools and deterministic pre-filters once P1's tool layer exists, per brain.txt's CODE-first principle:

| Existing code | What it does | Frozen-architecture role it maps to |
|---|---|---|
| `src/lib/scheduleEngine.ts` (`cascadeDelayFromTask`) | Deterministic BFS dependency-cascade of task delays, updates projects/tasks, writes `schedule_change_log` + `activity_log` | A CODE-tier controlled tool for Project Ops (Marcus) — schedule recalculation must stay deterministic per brain.txt §7 |
| `src/lib/alertUtils.ts` | Deterministic threshold rules (task/permit/inspection/decision → green/yellow/red) | The deterministic pre-filter that should run *before* any AI exception-summary call — exactly brain.txt's "deterministic sweeps first" rule |
| `src/lib/actionBoardHelpers.ts` (`getCriticalItems`, `getNeedsReviewItems`, `getAdminNeedsAttentionItems`) | Deterministic exception detection across tasks/permits/inspections/payments/incidents/delays, de-duplicated against an `action_items` DB state machine (Open/Done/Snoozed) | Very close to brain.txt's "Material Exceptions" concept (§8, Chief of Staff Executive Compression) — this is the layer Avery (Chief of Staff) should consume, not raw tables |
| `action_items` table + `ai_recommended_next_step` column | Already has a slot for an AI-generated recommendation attached to a deterministic action item | Natural landing spot for AI-assisted (not AI-authoritative) recommendations, consistent with CODE→AI→HUMAN |
| `src/components/OperatingLoopCard.tsx` | Documents an existing 10-step conceptual "CP360 Operating Loop" (Plan→Confirm→Execute→Update→Detect Risk→Escalate→Approve→Communicate→Recalculate→Report) | Conceptually pre-aligned with brain.txt's Universal Audit flow (Event→Workflow→Decision→Approval→Tool→State Change→Verification) — useful shared vocabulary when explaining the frozen architecture internally |
| `api/voice-assistant.ts`'s `DATA_TOOLS`/`WRITE_TOOLS` split | Read tools auto-execute; write tools require explicit confirmation before running | Direct prototype of the Policy/Authority "consequential action → explicit confirmation" branch (brain.txt §19) — pattern to formalize, not code to keep as-is |
| `user_consents` + `ConsentPage.tsx` | Versioned consent acceptance | Reusable for any AI-specific disclosure/consent requirement |
| `fileUpload.ts` / `project_files` | Org/project-scoped storage with signed URLs and visibility flags | Reusable pattern for AI-sourced or Drive-sourced document storage |

## 12. Technical Debt (relevant to AI initiative)

- Three incompatible AI implementations (§5) must be consolidated into one Integration/AI surface during P1, not extended independently.
- `activity_log` needs schema extension (correlation_id, workflow_id, company_id, record-type discriminator) before it can be trusted as an audit foundation.
- Hardcoded single-admin-email gating in both AI assistant functions is a security/scalability shortcut that predates any real role-based AI access model.
- No generated Supabase types (`supabase gen types typescript`) — all DB interfaces are hand-maintained in `src/lib/supabase.ts`, which will drift as new AI-related tables are added unless this is fixed or consciously continued.
- `ai_reports` table is dead/unused — decide reuse vs. removal before building the real Chief-of-Staff/report-generation surface.
- Nav/role wiring in `Layout.tsx`/`App.tsx` is hardcoded per role rather than config-driven, which will need to change for multi-company productization (P11) and arguably should not be copied as a pattern for Agent Registry UI.
- No automated test suite was found (no `*.test.ts`/`*.spec.ts` files, no test runner in `package.json` beyond `eslint`/`tsc`) — P1's "replayable workflow" exit gate will need new test infrastructure, not existing coverage to extend.

## 13. Risks

- **Building on top of the wrong AI surface.** The existing Gemini-based `api/voice-assistant.ts` is a compelling shortcut (it already has tool-calling and a confirm flow) but adopting it wholesale would lock in Gemini, client-side tool execution, and single-email auth — all of which conflict with the frozen architecture's model-neutral, server-side-controlled-tools, role-based-authority requirements. Recommendation: treat it as a design reference only (documented above), not a code base to extend.
- **RLS-as-only-authorization** means any AI-initiated write needs an explicit decision about *which* Postgres identity executes it (the human's session token, forwarded through, vs. a service-role identity gated by an application-level policy engine). This decision has architecture-wide consequences and should be made explicitly in P1, not implicitly by whichever pattern the first AI tool happens to copy.
- **No cost visibility today.** There is no billing/usage dashboard code, no per-request cost logging anywhere in the repo. The Cost Baseline document is necessarily built on stated assumptions (Vercel/Supabase tier, Gemini free tier) rather than measured data — see `CP360_AI_COST_BASELINE.md` for the explicit assumptions and what would need to be instrumented to replace them with real numbers.
- **Multi-company posture is data-model-only.** Anything hardcoded (nav, cadence, role labels, the single admin email) will need rework before a second real company can onboard — worth sequencing before P11 rather than discovering it during P11.

## 14. Open Questions for Product Owner Review (before P1 begins)

1. Should the existing three AI surfaces (`AskCP360`, `api/assistant.js`, `api/voice-assistant.ts`) be decommissioned outright once P1's real agent surface exists, or kept temporarily behind a feature flag for comparison?
2. Is Google Gemini retained as a secondary/cheap-tier model option under the frozen architecture's model-neutral routing contract (brain.txt §16), or is Anthropic/Claude the exclusive provider going forward?
3. Confirm `ai_reports` table: reuse for the Chief of Staff's synthesized output, or drop it?
4. Confirm whether `PROJECT_MANAGER`, `VENDOR`, `SUPPLIER` roles (referenced only in label maps, never implemented) are in scope for any near-term phase, since they affect the Integration Permission Matrix's role axis.
