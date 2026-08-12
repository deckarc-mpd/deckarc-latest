# CP360 AI Operations Brain — Phase 0 Discovery

Status: **Discovery only. No implementation code was written or modified to produce this document.**
Scope: `deckarc-mpd/deckarc-latest` as of this inspection (branch `claude/cp360-ai-phase0-discovery-3vtkij`, based on `main`/`jai`).
Authoritative inputs: `docs/ai-brain/brain.txt` (Frozen Architecture v4) and `docs/ai-brain/employeeidentity.txt` (AI Employee Identity spec).

---

## 1. Executive Summary

CP360 is a **single-tenant-per-organization, multi-organization** construction operations SPA built on **Vite + React + TypeScript**, backed entirely by **Supabase** (Postgres + Auth + Storage), deployed on **Vercel**. There is no separate backend service — almost all data access is `@supabase/supabase-js` calls made directly from React components, protected by Postgres Row Level Security (RLS).

The codebase already contains real, working project-operations modules (schedule, tasks, permits, inspections, daily updates, change orders, payments, etc.) at a level of completeness well beyond a prototype. It also already contains **five distinct pieces of "AI"**, of which only two make a real LLM call (both to Gemini, both gated to one hardcoded email address, both client-triggered) — the other three are deterministic string-template generators labeled "AI" in the UI.

There is **no scheduler, job queue, or background-worker infrastructure of any kind** in this repository, and **no Gmail / Google Calendar / Google Drive integration code exists** — the "Integrations" page is a static, hardcoded status board with every Google-related row marked `Placeholder`. Building the Frozen Architecture v4 Integration Gateway, SOP/workflow engine, audit system, and scheduled operating rhythm is therefore new work, not a refactor of something that exists.

---

## 2. Frontend Structure

- **Stack**: Vite 5, React 18.3, TypeScript 5.5, Tailwind CSS 3.4, `lucide-react` for icons. No UI component library (no MUI/Chakra/shadcn).
- **Origin**: built via Bolt.new (`.bolt/config.json` → `bolt-vite-react-ts` template; `.bolt/prompt` contains the original product brief — CP360 is described there as *"a CONVAZANT product. DECKARC LLC is one customer/workspace, not the hardcoded product brand"* — i.e., multi-tenant SaaS was already the intended shape).
- **Routing**: **no router library** (no `react-router`). `src/App.tsx` (519 lines) holds a single `useState<Page>('dashboard')` and renders pages by switch/conditional. Navigation is prop-drilled (`onNavigate`) through `Layout.tsx`, which exports the `Page` union type as the single source of truth for valid destinations.
- **Layout / navigation** (`src/components/Layout.tsx`): five distinct role-based sidebars (`convazantNavItems`, `adminNavItems`, `gcNavItems`, `subNavItems`, `clientNavItems`), each with its own grouping and color theme. This is where a "Command Center / Action Center" concept would be inserted per the frozen architecture, since the nav model already role-switches.
- **Pages** (`src/pages/*.tsx`, 36 files): Dashboard, ActionBoard, TomorrowWork, Projects/ProjectDetail, Tasks, DailyUpdates, PermitsInspections, Alerts, Reports, Users, Settings, FieldMode, ProjectTemplates, FileVault, IntegrationSettings, Company, CP360Leads, SubProjects/SubProjectDetail, plus a full parallel **Client Portal** (ClientDashboard/Projects/ProjectDetail/Messages/Schedule/Selections/Files/Payments) and **Convazant** (platform-owner) surface (ConvazantDashboardPage), plus internal tooling (CustomerDiscovery*, DemoSession*, FoundingPilot, Consent, ComingSoon).
- **Project detail is tab-based** (`src/components/project/*.tsx`, 27 files): ActivityLog, AiSummary, ArchiveRequests, ChangeOrders, ClientDecisions, Closeout, CommunicationHub, CrewConfirmations, DailyUpdates, DelayReasons, Incidents, InspectionChecklist, Inspections, Materials, Payments, Permits, PhaseReadiness, PhotoLog, PunchList, RFIs, ScheduleChangeLog, ScheduleUpdates, SubTaskResponseModal, TaskConversationModal, Tasks, TeamMembers, WeatherRisks. This tab set **is** the enumerated module list the Frozen Architecture references (schedules, tasks, photos/docs, permits, inspections, delays, approvals, conversations, finance/change orders) — they already exist as live, working UI+DB features, not stubs.
- **Shared libs** (`src/lib/`): `supabase.ts` (client + every TypeScript interface for every DB row shape — the closest thing to a canonical domain model), `scheduleEngine.ts` (dependency-cascade delay engine, described in §6), `alertUtils.ts` (status→color mapping and 3 pure `calculate*Alert()` functions — the only real deterministic "rule engine" in the repo today), `actionBoardHelpers.ts` (shared Action Board item derivation, explicitly documented in-file as the single source of truth so Dashboard counts and Action Board filters never disagree — a good existing example of the "one computation, many surfaces" pattern the frozen architecture wants).

## 3. Backend Structure

There is **no standalone backend application**. Three things play backend roles:

1. **Supabase Postgres + Auth + Storage** — the real backend. All CRUD happens via RLS-protected direct table access from the browser using the anon key (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). 68 SQL migration files under `supabase/migrations/`, additive and iterative (many are literally named `fix_*`), no `supabase/config.toml` present (this is a hosted/dashboard-managed project, not a fully declarative local Supabase setup).
2. **Two Supabase Edge Functions** (`supabase/functions/`): `seed-test-users` and `test-login`. Both are Deno-runtime dev/test tooling (create/reset the 5 canned test accounts) invoked manually, not scheduled, not part of any production workflow.
3. **Two Vercel Serverless Functions** (`api/`): `assistant.js` and `voice-assistant.ts`. These are the only server-side compute in the app and the only place a secret (Gemini API key) is held. See §5.

There is no ORM (Prisma/Drizzle/TypeORM). Data access is 100% hand-written `supabase.from('table').select/insert/update()` calls, duplicated per-component (e.g., the same `projects`/`tasks`/`action_items` queries are re-written independently in `AskCP360.tsx`, `VoiceAssistant.tsx`, and various dashboard pages, each with slightly different field lists — see Gap Analysis for the reuse implication).

## 4. Auth & Tenant Model

- **Auth provider**: Supabase Auth (email/password only — `supabase.auth.signInWithPassword`). No SSO/OAuth login, no MFA visible in code.
- **Session/profile**: `AuthContext.tsx` wraps `supabase.auth` session state and eagerly joins to a `user_profiles` row (`fetchProfile`), exposing `{ user, session, profile }` app-wide via `useAuth()`.
- **Role model**: `UserRole` (in `src/lib/supabase.ts`) is a closed TS union of 5 values, matching a plain `text` column in Postgres (no DB enum type, no CHECK constraint found — role correctness is enforced only at the RLS-policy string-comparison level and in the TypeScript type, which is a drift risk):
  - `CONVAZANT_SUPER_ADMIN` — platform owner (Convazant, the vendor)
  - `DECKARC_ADMIN` — company admin (today, literally DeckArc; the type name is company-specific even though the org model is multi-tenant, a naming smell)
  - `GENERAL_CONTRACTOR`
  - `SUBCONTRACTOR`
  - `CLIENT`
  - `getRoleLabel()` in `alertUtils.ts` also maps `PROJECT_MANAGER` and `VENDOR`/`SUPPLIER`, which do not appear in the `UserRole` type or in any migration — dead/aspirational role labels.
- **Tenant model**: `organizations` table (id, name, type) created early, later extended (`script6_organizations_enhanced.sql`) with `status`, `workspace_status`, `plan`, `service_area`, `business_type`, `organization_type` (Platform Owner vs Contractor Company) — i.e., the schema already anticipates multiple contractor-company tenants beyond DeckArc, even though only DeckArc is seeded today. `user_profiles.organization_id` is the tenant FK. **Tenant isolation is enforced via RLS policies**, not via a query-time `WHERE organization_id = ...` convention consistently applied in application code — many RLS policies grant broad `authenticated` SELECT (`USING (true)`) on tables like `projects`/`tasks`, relying on role-based policies rather than strict per-org row filtering in several places (flagged in Gap Analysis — relevant because the two live AI features query these tables directly from the browser).
- **Client Portal isolation**: a separate `ClientPreviewContext.tsx` exists to let admins preview the client-facing UI; client users see a materially different, filtered UI (their own project only, `client_visible_notes`/`is_client_visible` gating).
- **Onboarding flow**: `user_invitations`, `access_requests`, `workspace_requests`, `user_consents` tables (added in `script6`) implement an admin-invite + consent-acceptance flow, including an `ai_consent_version` field on `user_consents` — i.e., **there is already a legal/consent hook for AI usage acceptance**, currently unused by any live AI feature.

## 5. Existing AI Code (all of it)

Five things in the repo are labeled or function as "AI." Only two ever call an LLM.

| # | Location | Real LLM call? | Model | Gating | Notes |
|---|---|---|---|---|---|
| 1 | `src/components/project/AiSummaryTab.tsx` ("AI Summary" tab, "AI-Enabled" badge) | **No** | — | none (role-based visibility only) | Pure deterministic TypeScript: fetches 14 tables client-side, string-concatenates a report with hand-written thresholds (`if (missingInfo.length >= 3) confidenceLevel = 'Low'`). Writes result to `ai_reports` table. This is CODE, mislabeled as AI. |
| 2 | `src/components/AskCP360.tsx` ("Ask CP360" panel, all roles) | **No** | — | role-based canned prompt list | `generateAIResponse()` is a keyword-matching `if/else` chain (`q.includes('today')`, `q.includes('block')`, ...) against a small live-data summary string. No model call. Client safety filter blocks a hardcoded term list for `CLIENT` role. |
| 3 | `src/components/customerDiscovery/aiSummary.ts` | **No** | — | internal tool | Same deterministic-template pattern, for the internal product-research module. File comment explicitly says *"Does NOT call any external AI API."* |
| 4 | `api/assistant.js` + `src/components/AdminVoiceAssistant.tsx` | **Yes** | Google Gemini `gemini-3.5-flash-lite` (free tier) | Hardcoded to exactly `deckarc.admin@test.com`, re-checked server-side via Supabase token → email lookup | General Q&A about how the platform works. No tools/function-calling, no live data access, no writes. Simple chat proxy; key never reaches browser. |
| 5 | `api/voice-assistant.ts` + `src/components/VoiceAssistant.tsx` | **Yes** | Same Gemini model, **with function-calling** | Same single hardcoded admin email, checked via a plain equality on a client-supplied `email` field in the POST body (**not** re-verified against a server-side session token the way `assistant.js` does it — see Gap Analysis) | The most architecturally advanced AI in the repo: defines `navigate`, `query_projects`, `query_tasks`, `query_action_items`, `query_permits` (read tools, executed client-side against Supabase after the model requests them) and `create_project`, `update_task_status` (write tools, gated behind a spoken/typed "yes" confirmation in `VoiceAssistant.tsx`, no server-side re-validation, no audit record, no idempotency key). Uses the browser's native `SpeechRecognition`/`speechSynthesis` (Web Speech API — Chrome/Edge only, no cost, no external voice vendor). Includes a "wake word" always-listening mode. |

**Nothing here resembles an agent registry, SOP engine, workflow persistence, controlled-tool layer, policy/authority engine, or audit trail.** The write-confirmation pattern in #5 is the single closest analog to the frozen architecture's "policy/authority check → explicit confirmation" voice flow, and it is a useful reference implementation to generalize, not throw away.

There is also `ai_reports` (Postgres table: `project_id`, `report_type` [`internal`/`client`], `report_text`, `created_by_user_id`) — a plausible seed for a future "Knowledge Brain" / report-history table, currently just an append log for the deterministic AiSummaryTab output.

`IntegrationSettingsPage.tsx` and `ConvazantDashboardPage.tsx` both list "AI Assistant" as a platform integration with status `Simulated`, alongside Email/SMS/Weather — i.e., the product's own admin-facing self-description already knows today's AI is not real/live.

## 6. Scheduler / Jobs / Queues

**None exist.** Specifically checked and absent:
- No `pg_cron` extension usage anywhere in `supabase/migrations/`.
- No Vercel Cron config in `vercel.json` (only `buildCommand`/`rewrites`).
- No `node-cron`, `agenda`, `bullmq`, `bee-queue`, or any job-queue package in `package.json`/`package-lock.json`.
- No scheduled Supabase Edge Functions (the two that exist are manually invoked dev tooling).
- Only 2 DB triggers in the entire schema: `on_auth_user_created` (standard Supabase pattern, creates a `user_profiles` row on signup) and `trg_cd_sessions_updated_at` (a plain `updated_at` bump trigger on the Customer Discovery module). Neither does business-rule work.

Everything that looks like "automation" today is actually **synchronous, on-demand, client-triggered computation**:
- `scheduleEngine.ts`'s `cascadeDelayFromTask()` — a real, well-built BFS dependency-cascade delay propagator (finds all downstream tasks via `dependency_task_id`, pushes dates by working days honoring a project's `allow_saturday_work`/`allow_sunday_work` flags, writes `schedule_change_log` + `activity_log` rows, and bumps the project to `Delayed`/red if the cascade pushes the finish date). This runs **only when a user action triggers it** — there is no periodic re-check.
- `alertUtils.ts`'s `calculateTaskAlert`/`calculatePermitAlert`/`calculateInspectionAlert`/`calculateDecisionAlert` — pure functions computed **at render time**, not persisted, not swept. A task due in 2 days shows yellow only while someone has the page open; nothing proactively surfaces it.
- `actionBoardHelpers.ts` — same pattern: derived at read-time from live table state, not from a periodic sweep.

This is the single biggest structural gap relative to the Frozen Architecture: **§11 (Scheduled Operating Rhythm)**, **§20 (Core Scheduled Events)**, and the entire "deterministic sweep first, AI only for exceptions" cost model have zero infrastructure to build on. `project_calendars` (per-project working-day config: `working_days_default`, `allow_saturday_work`, `allow_sunday_work`, `holiday_work_allowed`) and `us_holidays` (pre-seeded 2026–2027 US federal holidays) **do already exist** as data — they're exactly the "company timezone, business calendar, holidays" primitives the frozen architecture's scheduler requirement calls for, just not yet wired to anything that runs on a clock.

## 7. Gmail / Google Calendar / Google Drive Integration

**None exists.** Confirmed by:
- `package.json`/`package-lock.json`: zero occurrences of `googleapis`, `google-auth-library`, `@google-cloud/*`, or any Google API SDK.
- No OAuth token storage table/columns anywhere in `supabase/migrations/`.
- No `/api/*` route touches Google's APIs (the only two serverless functions are the Gemini chat proxies above).
- `IntegrationSettingsPage.tsx` (admin-only settings page): a hardcoded `INTEGRATIONS` array. The `calendar` entry: `status: 'Placeholder'`, note: *"Calendar sync is a placeholder. Configure Google Calendar or Outlook Calendar for production."* There are no `email`(Gmail-specific)/`drive` entries at all today — only a generic `email` row (`status: 'Simulated'`, generic SMTP/SendGrid note) and `storage` (`status: 'Simulated'`, generic Supabase Storage/S3 note). `ConvazantDashboardPage.tsx` shows an equivalent static list.
- No scopes, provider IDs, sync cursors, or project-linkage logic exist anywhere to inspect — this is a from-scratch build for Phase 1+, not a wiring/refactor task.

## 8. Deployment Topology & Visible Hosting Costs

- **Frontend + serverless**: Vercel. `vercel.json` builds with Vite, serves `dist/`, rewrites `/api/*` to serverless functions and everything else to `index.html` (SPA fallback). No `crons` key present.
- **Database/Auth/Storage**: Supabase (managed). Referenced only via env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); no infra-as-code, no self-hosting, no Docker/Kubernetes manifests anywhere in the repo.
- **AI provider**: Google Gemini, explicitly free tier (`AI_ASSISTANT_SETUP.md`: *"has a free tier"*), key stored as a Vercel env var (`GEMINI_API_KEY`), never bundled to the client.
- **No cost figures are visible in the repository** — no billing dashboards, invoices, usage exports, or infra-cost documentation are checked in (expected; this is normal for a Vercel+Supabase app — actual current spend must come from the Vercel/Supabase account owners, not this codebase). What *is* visible: the product deliberately chose the cheapest tier of everything it touches (free Gemini model, free browser speech APIs, free-tier-friendly serverless functions, no queue/cache/search infra). This is a lean baseline consistent with the Frozen Architecture's cost posture — see `CP360_AI_COST_BASELINE.md`.
- **Local dev**: `npm run dev` (Vite only — `/api/*` calls 404 without `vercel dev`, per `AI_ASSISTANT_SETUP.md`).

## 9. Reusable Components for the AI Brain Build

These existing pieces are directly reusable as **controlled tools / building blocks**, not replacements:

- **`src/lib/supabase.ts` domain types** — already a de facto canonical schema reference (every table's shape, in one file). Good starting point for a controlled-tool parameter/response contract.
- **`scheduleEngine.cascadeDelayFromTask()`** — a real deterministic domain service. This is exactly the kind of thing the Frozen Architecture wants wrapped as a "controlled tool" invoked by SOPs/workflows, not reimplemented.
- **`actionBoardHelpers.ts`** — already the single-source-of-truth pattern for "what needs attention," with an explicit contract comment about Dashboard/Action Board parity. This is the natural precursor to a deterministic exception-detection layer that would feed a Chief-of-Staff-style compression agent.
- **`activity_log` table** — an append-only, project/user/action-scoped log already exists and is already written to by several flows (schedule cascades, etc.). It is not yet a full audit system (no `correlation_id`, `company_id`, `workflow_id`, no tool-call/approval/verification record types — see Gap Analysis) but it is the right table to extend rather than replace.
- **`user_consents.ai_consent_version`** — an unused but ready-made hook for the AI-usage consent the Frozen Architecture's governance model will eventually need.
- **`project_calendars` + `us_holidays`** — ready-made inputs for the "company-configurable, timezone/business-calendar-aware" scheduler requirement.
- **`VoiceAssistant.tsx`'s confirm/cancel pattern** (`pendingConfirm`, "say yes or no") — the closest existing analog to the frozen architecture's voice policy/authority "explicit confirmation" step; worth generalizing into the real policy engine rather than discarding.
- **Employee-identity naming**: none of Avery/Maya/Daniel/Marcus/Clara/Natalie appear anywhere in the codebase today — the identity spec in `employeeidentity.txt` is unimplemented, which is expected for Phase 0, but confirms display-identity work is greenfield too.

## 10. Technical Debt & Risks Observed

1. **Two competing "confirm this is a write" patterns already exist** (`AskCP360`'s `adminApprovalNeeded` flag, which is purely cosmetic and blocks nothing; `VoiceAssistant`'s spoken yes/no, which does block execution but isn't audited). A real policy/authority engine needs to supersede both, not sit beside them.
2. **`voice-assistant.ts` authorizes by trusting a client-supplied `email` field** (`body.email.toLowerCase() !== ADMIN_EMAIL`) rather than verifying a Supabase session token server-side the way `assistant.js` correctly does. Any future work that generalizes this endpoint beyond the single hardcoded admin account must fix this before it's usable for more than one user.
3. **Voice/chat data-read tools query tables without an explicit `organization_id` filter** (`executeDataTool` in `VoiceAssistant.tsx` — e.g. `query_projects` does `supabase.from('projects').select(...)` with no org scoping beyond whatever RLS permits). Because RLS on several tables is broad (`USING (true)` for `SELECT`, gated by role rather than org), this currently works only because there is effectively one live tenant (DeckArc) with data; it will not safely scale to multi-company Product without RLS/query tightening — a prerequisite noted for Phase 1, not something to silently work around.
4. **Duplicated live-context-fetching logic**: `AskCP360.tsx`, `VoiceAssistant.tsx`, and `AdminVoiceAssistant.tsx` (via a different mechanism) each independently re-implement "fetch top N projects/tasks/action_items and stringify them" with slightly different field lists and limits. A shared Integration/Context Gateway would collapse this into one function.
5. **Role type drift**: `UserRole` (TS) has 5 values; RLS policies and `getRoleLabel()` reference up to 7 (`PROJECT_MANAGER`, `VENDOR`, `SUPPLIER` appear in label mapping only); no DB-level enum/CHECK constraint enforces the set. Low risk today, but worth tightening before an Agent Registry starts making role-based authority decisions against this column.
6. **RLS policy footguns for future audit work**: `activity_log` INSERT policy is `WITH CHECK (true)` for any authenticated user (anyone can write any log row, including forging `user_full_name`/`user_role`/`old_value`/`new_value`). Fine for an internal activity feed today; not fine as the backbone of a "Universal Audit — P1 foundation" system without tightening (e.g., server-side-only writes, or triggers that stamp actor identity from `auth.uid()` rather than trusting client-supplied fields).
7. **68 additive/patch-style migrations**, several literally named `fix_*_rls_*`, indicate RLS policy iteration has been trial-and-error rather than reviewed up front. A new Agent Registry / policy engine schema should be designed once, reviewed, and not follow this pattern.
8. **"AI-Enabled" UI labeling on non-AI features** (`AiSummaryTab`, `AskCP360`) is a product-trust risk independent of engineering: users are currently told they're getting AI when they're getting a template. Whatever ships in later phases should either upgrade these to real AI under the frozen architecture's routing rules, or the labeling should be corrected — a product decision, flagged here, not resolved here.

## 11. Explicit Non-Findings (checked, not present)

- No vector database, embeddings, or `pgvector` usage anywhere.
- No existing "agent," "SOP," "workflow," or "policy" tables/types.
- No webhook receivers for Gmail/Calendar/Drive push notifications.
- No multi-provider LLM router/abstraction — the two live AI calls hit the Gemini REST endpoint directly and would need to be rewritten regardless of what model-routing decision Phase 1 makes.
- No existing telemetry/cost-tracking for AI calls (no token/cost logging on the Gemini calls).

---

*This document is descriptive only. See `CP360_AI_GAP_ANALYSIS.md` for what this implies must be built, and `CP360_AI_IMPLEMENTATION_PLAN.md` for sequencing. No architectural decision is made in this file.*
