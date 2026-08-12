# ADR-CP360-AI-002: Modular-Monolith-First Infrastructure

**Status:** Accepted
**Date:** 2026-08-12
**Phase:** P0
**References:** `docs/ai-brain/brain.txt` §14 ("Explicit Cost-Control Rules"), §15 ("Recommended Lean Physical Deployment"), §16 ("Billion-Dollar Scale Without Billion-Dollar Day-One Spend"), §23.4–§23.5 (Hard Constraints / Do-Not-Build Gate); `CP360_AI_PHASE0_DISCOVERY.md` §§2, 8, 13; `CP360_AI_GAP_ANALYSIS.md` §12.

## Context

The frozen architecture mandates: "Prefer a modular monolith using the existing CP360 deployment unless Phase 0 proves a stronger reason" (brain.txt §14), and provides an explicit Do-Not-Build list (Kubernetes, microservice decomposition, per-agent runtimes/queues/vector-DBs/event-buses, a data warehouse, agent-to-agent chat infra, a separate voice engine) that requires a written ADR and product-owner approval before any exception is made (§23.5).

Phase 0 discovery (`CP360_AI_PHASE0_DISCOVERY.md` §§2, 8) found **no evidence of any measured need** that would justify an exception:

- **Deployment:** One Vite/React static frontend + Vercel serverless functions + one Supabase Postgres instance. No containers, no orchestration, no infrastructure-as-code.
- **Scale:** No production load data was found in the repo (no metrics/monitoring config), consistent with this being a single-pilot-customer (DeckArc) deployment, not yet at any scale that would stress a monolith.
- **Concurrency/durability:** No queue, no background worker, no evidence of throughput problems — everything today is synchronous request/response from the browser.
- **AI surface:** The three existing AI implementations (`AskCP360.tsx`, `api/assistant.js`, `api/voice-assistant.ts`) all run as ordinary frontend code or a Vercel serverless function — none required a dedicated runtime, and none broke under any documented load.

In short: **Phase 0 found zero evidence that would satisfy any of brain.txt §14's approval conditions for departing from the lean default.**

## Decision

**CP360's AI Operations Brain (P1–P11) will be implemented as logical modules inside the existing deployment surface — the same Vite/React frontend, the same Supabase Postgres database, and Supabase Edge Functions / Vercel serverless functions for server-side logic — with no new deployables, no new runtime, and no new infrastructure category, unless a specific future ADR documents measured evidence crossing one of the thresholds in brain.txt §25 (Future Scale Triggers).**

Concretely, mapped onto the actual repo:

| Frozen logical boundary (brain.txt §15) | Implementation choice for CP360 |
|---|---|
| Domain services | Stay inside the existing frontend/Supabase call pattern; new deterministic logic (billing, margin, cash forecast, etc.) ships as TypeScript modules under `src/lib/` (extending the pattern of `scheduleEngine.ts`/`alertUtils.ts`) and/or Supabase Edge Functions where server-side execution is required |
| Agent/SOP registry | New Postgres tables in the existing Supabase database (no separate config service) |
| Workflow state | New Postgres tables in the existing Supabase database |
| Events | A new `events` table + application-level dispatcher inside the existing backend surface — not a message broker (Kafka/SQS/etc.), since no measured throughput need exists |
| Audit | Extend `activity_log` (add `company_id`, `workflow_id`, `correlation_id`, record-type discriminator) in the existing database, per `CP360_AI_GAP_ANALYSIS.md` §2 — not a dedicated audit/event store |
| Knowledge | Existing domain tables + a new lightweight `knowledge_items` metadata table + one shared retrieval approach (e.g. Postgres full-text search / `pgvector` if semantic retrieval proves necessary) — explicitly **one** shared index, never one per agent |
| Google integrations | One shared server-side connector layer (new Supabase Edge Functions or Vercel serverless functions), not a connector per agent |
| Voice | A provider adapter + session service reusing the same backend tools/policies built for non-voice — not a separate voice business-logic engine (this retires the current bespoke `api/voice-assistant.ts` logic per Gap Analysis §11, replacing it with a thin transport layer over the shared Controlled Tools) |
| Scheduler | Supabase's `pg_cron` extension (Postgres-native, already available in the existing database) or Vercel Cron hitting a serverless endpoint — not a dedicated job-scheduling service. See `CP360_SCHEDULED_OPERATING_EVENTS.md` for the specific recommendation |
| AI model calls | A single provider-neutral routing module (new, small) called from Edge/serverless functions — not a "complex multi-provider optimization service" |

**Explicitly not introduced, per the Do-Not-Build Gate (brain.txt §23.5), because Phase 0 found no measured evidence to justify any of them:** Kubernetes/container orchestration, a broader microservice decomposition, a separate deployable service per AI employee, a vector database per agent, a department-specific event bus, a separate queue per agent/department, a data warehouse for the AI initiative, free-form agent-to-agent chat infrastructure, a separate voice workflow engine, an unrestricted SQL tool for any model, direct agent access to OAuth tokens/secrets, LLM calls for authoritative arithmetic/dates/permissions/state transitions.

## Consequences

- **Positive:** Every P1+ deliverable can be built and deployed through the existing CI/CD path (push → Vercel build) with no new operational surface to learn, monitor, or secure. This directly serves the "lean deployment" and "human authority where it matters" principles without any translation cost.
- **Positive:** Logical module boundaries (separate tables, separate Edge Functions per concern, a clean tool-calling interface) are designed so that any individual module *could* be extracted into its own service later, per brain.txt §16's "designing replacement boundaries, not pre-purchasing future infrastructure" — this ADR does not foreclose future extraction, it just doesn't pay for it now.
- **Negative / tradeoff:** A modular monolith means CP360's AI workload and its core operational workload share the same Postgres instance and, to some extent, the same deploy cadence. If one AI-heavy module (e.g., high-volume audit writes) starts to degrade core app performance, that is the trigger condition in brain.txt §25 ("One module dominates CPU/memory/deploy cadence → Extract that module into a service") — not a reason to avoid this ADR's default, but a documented condition under which a follow-up ADR should propose extraction.
- **Negative / tradeoff:** `pg_cron`/Vercel Cron is a simpler scheduler than a dedicated workflow-orchestration platform; very long-running or highly complex multi-day workflows may eventually need more than a cron-triggered check-and-advance pattern can comfortably provide. This is an accepted limitation until the Future Scale Triggers in brain.txt §25 ("Workflow throughput exceeds existing job mechanism") are actually met.

## Alternatives Considered

- **Adopt a dedicated workflow-orchestration platform (e.g., Temporal) now, since the frozen architecture eventually implies durable multi-step workflows.** Rejected: no measured throughput/reliability need exists yet (Phase 0 found none), and brain.txt §14 explicitly forbids introducing infrastructure "merely because the future architecture could use it."
- **Extract a separate "AI service" (own deployable) from day one, reasoning that AI workloads are different enough from CRUD workloads to warrant isolation.** Rejected: no isolation/scaling/security evidence was found (brain.txt §14's approval condition for "separate runtime per agent"), and it would immediately violate the Do-Not-Build Gate without an approval basis.
- **Use a managed message queue (SQS/PubSub) for the event abstraction instead of a Postgres table.** Rejected for the same reason — no measured need, and a Postgres-backed event table is sufficient for current and reasonably foreseeable pilot-scale throughput while keeping everything inside the existing database.

## Rollback

If a future phase's measured evidence justifies departing from this default for a specific module (e.g., audit volume genuinely threatens OLTP performance per brain.txt §25), the fix is to write a new, narrowly-scoped ADR for that one module's extraction — not to revert this ADR wholesale. This ADR's default (modular monolith, existing deployment, existing database) remains the standing rule for every module until such an ADR supersedes it for that specific module.
