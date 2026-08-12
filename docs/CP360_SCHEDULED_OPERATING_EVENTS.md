# CP360 Scheduled Operating Events — The Operating Clock

**Phase:** P0 deliverable (target-state design; no scheduler exists yet — see below).
**References:** `docs/ai-brain/brain.txt` §11 ("Scheduled Operating Rhythm"), §20 ("Core Scheduled Events and Default Sequence," Figure 13), §23.8 ("Scheduled Event Gate"); `docs/ai-brain/employeeidentity.txt`; `CP360_AI_PHASE0_DISCOVERY.md` §8; `CP360_AI_GAP_ANALYSIS.md` §8.

## 0. Current State

**No scheduler, cron, or background-job mechanism exists anywhere in this codebase.** No `pg_cron`, no Supabase scheduled Edge Functions, no Vercel Cron entries in `vercel.json`, no external job runner (`CP360_AI_PHASE0_DISCOVERY.md` §8). Every "schedule"-named table/file in the repo (`schedule_change_requests`, `schedule_change_log`, `scheduleEngine.ts`) concerns *construction* scheduling, not job scheduling. This document defines the target operating clock to build starting in P1 (foundation) and activate in P4 (per `CP360_AI_IMPLEMENTATION_PLAN.md`).

## 1. Recommended Mechanism (per ADR-002's lean-infrastructure decision)

**Supabase's native `pg_cron` Postgres extension**, invoking a small set of Postgres functions or calling out to Supabase/Vercel Edge Functions on a schedule, is the leanest option that satisfies brain.txt §23.4's "implement scheduled triggers using existing scheduler/background-job mechanisms where possible" — it requires no new infrastructure category (it's a Postgres extension inside the database CP360 already runs on) and no new deployable. **Vercel Cron** (hitting a serverless endpoint on a schedule) is the fallback/alternative if `pg_cron` isn't available on the project's Supabase tier — either satisfies ADR-002 equally; the choice is an implementation detail for P1, not an architectural one.

Every scheduled trigger must, per brain.txt §23.8:
- run a deterministic check first,
- skip the AI call entirely when no material change/exception exists ("Scheduled Event Rule," brain.txt §11: "If nothing changed and no exception exists, stop with zero AI call"),
- de-duplicate against event-driven workflows (an event that already fired the same SOP shouldn't be re-run by the next sweep),
- use company-configurable cadence/timezone (not a global fixed clock — brain.txt §20's times are explicitly "configuration examples only," and must respect company timezone, business calendar, holidays, and project-status exclusions),
- record every run/exception/action in the Universal Audit system built in P1.

## 2. Target Operating Clock

Default sequence (company-configurable; times below are the brain.txt §20 defaults, stored as per-organization config, not hardcoded):

| Time (default) | Event | Owner (`agent_id` / display) | Deterministic pre-check | AI invoked only when |
|---|---|---|---|---|
| 06:00 | Overnight reconciliation / connector health | System (Integration Gateway) | Check connector sync cursors, last-successful-sync timestamps for Gmail/Calendar/Drive | Never — pure health check, no AI |
| 06:30 | Project readiness calculations | System / `project_operations` (Marcus) | Recompute readiness flags from `tasks`, `crew_confirmations`, `materials`, `permits` (reusing `alertUtils.ts`-style deterministic rules) | Not at this step — feeds the 15:00 Tomorrow Readiness AI step |
| 07:00 | Trade / material / inspection rule checks | `project_operations` (Marcus) | Rule sweep over `materials`, `project_inspection_requirements`, `crew_confirmations` for missing confirmations/deliveries | Only if a rule sweep finds an unresolved exception needing free-text interpretation |
| 07:30 | Chief of Staff exception synthesis | `chief_of_staff` (Avery) | Pull the deterministic exception list (`actionBoardHelpers.ts`-equivalent, extended per Gap Analysis §7) | AI synthesizes only the compressed exception list into "5–10 decisions that matter today" — never sees raw event volume (brain.txt §8) |
| 08:00 | Morning Command Center | `chief_of_staff` (Avery) | N/A — presentation of 07:30's output | AI content is Avery's already-synthesized output; this step is UI delivery, not a new AI call |
| 12:00 | Critical exception recheck | `chief_of_staff` (Avery) | Re-run only against *unresolved* Critical-Now items from the morning run (not a full re-sweep) | Only for items still unresolved and materially changed since morning |
| 15:00 | Tomorrow Readiness | `project_operations` (Marcus) | Deterministic gate sweep (crew/material/permit/inspection prerequisites for tomorrow's scheduled tasks) | AI interprets only the free-text/ambiguous exceptions the gate sweep surfaces |
| 16:00 | Trade confirmation cutoff | `project_operations` (Marcus) | Workflow/message automation first (deterministic reminder send via Integration Gateway) | AI drafts only for confirmations still unresolved after the automated reminder |
| 16:30 | Client communication sweep | `customer_success` (Natalie) | Deterministic check: which projects have a status change or milestone needing client communication | Draft generated only for projects actually needing an update — never a blanket daily message |
| 17:00 | Tomorrow plan finalization | `project_operations` (Marcus) | Roll up 15:00/16:00 results into the finalized tomorrow plan | Same synthesis pattern as Avery's morning step — compress, don't re-derive |
| 17:30 | End-of-day close / tomorrow setup | `chief_of_staff` (Avery) | Deterministic close-out of the day's resolved/unresolved items | AI synthesizes only unresolved material items into the next day's starting context |
| Daily | Permit/Inspection Sweep | `compliance` (Clara) | Rules/deadlines first (`permits.expected_approval_date`, `inspections.scheduled_date` vs. today) | AI only for interpreting ambiguous correspondence/correction notices |
| Daily | Billing / AR / Margin Sweep | Finance services (no agent — deterministic per brain.txt §5) | Deterministic math against `payment_milestones`/the future Billing/Margin Engine (P8) | AI only for ambiguous dispute/exception explanation, never for the math itself |
| Weekly | 14-Day Look-Ahead | `project_operations` (Marcus) | Calculate dependency chains deterministically before any AI synthesis | AI synthesizes only the calculated risk/dependency output |
| Weekly | Sales Pipeline Hygiene | `sales` (Maya) | Rules find stale leads (`cp360_leads`, no activity in N days) | AI handles only the nuanced follow-up drafting for flagged leads |
| Weekly | Executive Portfolio Review | `chief_of_staff` (Avery) | Aggregate KPI/exception rollup computed deterministically | AI synthesizes the aggregated summary, not raw per-project data |
| Monthly | Knowledge Review | System + human reviewers | N/A | AI proposes candidate knowledge updates (Knowledge Brain, P1–P9); governed human promotion required — never auto-published |
| Monthly | Connector/Permission Audit | Admin/System | Deterministic health/permission checks across the Integration Gateway and Agent Registry's Data Permissions | Never — pure deterministic compliance check |

## 3. Implementation Notes Specific to This Repo

- **Company timezone/business calendar**: `project_calendars` and `us_holidays` tables already exist in the schema (`add_advanced_modules` migration) — these are the natural home for the "company timezone, business calendar, holidays, project-status exclusions" configurability brain.txt §20 requires, rather than building a new calendar-config system from scratch.
- **De-duplication against event-driven workflows**: because P1's event abstraction and scheduler both write to the same `workflow_runs` table, a scheduled sweep can check "has this SOP already run for this project/day via an event trigger?" before starting — avoiding the double-AI-call risk brain.txt §23.8 warns against.
- **Every row in this table produces an audit record** even when it results in zero AI calls — a "checked, nothing to do" run is itself evidence the system is working and is required for the Monthly Connector/Permission Audit to have something to verify against.
- **Cadence must be config, not code**: brain.txt §20 explicitly states the times shown are "configuration examples only." The scheduler implementation must read cadence/timezone from a per-organization config table (new in P1, extended in P11's multi-company productization) rather than hardcoding the table above — this table documents the **default** configuration DeckArc (the first pilot) ships with, not a fixed system behavior.
