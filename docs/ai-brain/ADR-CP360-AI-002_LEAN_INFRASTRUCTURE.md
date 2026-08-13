# ADR-CP360-AI-002: Build the AI Operations Brain as a Modular Monolith Inside the Existing Vercel + Supabase Deployment

- **Status**: Proposed (Phase 0 — for product-owner review before Phase 1 build begins)
- **Date**: 2026-08-12
- **Driven by**: Frozen Architecture v4 §14, §15, §16, §23.4, §23.5
- **Related**: `CP360_AI_PHASE0_DISCOVERY.md` §3, §8; `CP360_AI_GAP_ANALYSIS.md` §9; `CP360_AI_COST_BASELINE.md`

## Context

Phase 0 discovery found the current production topology is deliberately minimal:

- **Frontend**: Vite/React SPA on Vercel.
- **Compute**: exactly two Vercel Serverless Functions (`api/assistant.js`, `api/voice-assistant.ts`), both thin proxies to Gemini's free tier.
- **Data**: one managed Supabase Postgres instance (Auth + Storage + DB), accessed almost entirely via RLS-protected client-side queries, no separate application backend.
- **No** Kubernetes, containers, microservices, message queues, job schedulers, caches, search clusters, or data warehouses exist anywhere in the repo (Gap Analysis §9 — the "Do Not Build" list is already, accidentally, fully honored).

The Frozen Architecture v4 explicitly requires this to stay true going forward (§14 "Explicit Cost-Control Rules," §15 "Recommended Lean Physical Deployment," §23.5 "Explicit Do Not Build Gate") while still supporting an eventual "billion-dollar-scale" business (§16). Building the AI Operations Brain (audit, event/SOP/workflow engine, controlled tools, policy engine, Integration Gateway, Knowledge Brain, six agents, scheduled operating rhythm, voice) is a substantial amount of new capability. The risk this ADR addresses is the natural temptation to justify new infrastructure (a dedicated workflow engine, a message queue, a vector DB, a separate agent service) "because a real AI platform needs it," when the frozen architecture's Core Rule is the opposite: **design boundaries for enterprise scale, build infrastructure for today's measured load.**

## Decision

**The entire Phase 1–P9 AI Operations Brain is built as new modules inside the existing CP360 application and existing Vercel + Supabase deployment — a modular monolith, not a new service.** Specifically:

1. **Deployment stays two-tier**: Vercel (frontend + serverless functions) + Supabase (Postgres/Auth/Storage). New capability is added as:
   - New Postgres tables/schemas in the existing Supabase database (agent registry, SOP/workflow state, audit records, Integration Gateway token storage, Knowledge Brain metadata) — not a new database.
   - New Vercel Serverless Functions (or, if request patterns require longer-running execution than serverless allows — e.g. a scheduler tick that fans out work — Vercel Cron Jobs calling those same functions) — not a new backend service, not a container platform.
   - New React modules/components inside the existing SPA (Command Center, Action Center, Agent-facing UI) — not a second frontend.
2. **Logical separation, not physical separation.** Domain services, AI/SOP workflows, the voice adapter, and the Integration Gateway are separate *modules/directories* in the same codebase and the same deployable, per frozen §15's table (`Domain services → keep inside existing backend`, `Workflow state → existing DB`, `Events → existing app event/job mechanism first`, `Audit → existing DB with indexed correlated tables`, `Knowledge → existing DB metadata + one shared retrieval approach`, `Google integrations → one shared server-side connector layer`, `Voice → provider adapter + session service, same backend tools/policies`). Each module is written so it *could* be extracted into its own service later without a rewrite (clear interfaces, no hidden cross-module DB access outside its own tables) — but is not deployed separately today.
3. **One Agent Registry, one SOP/workflow engine, one Integration Gateway, one Knowledge Brain, one policy engine, one audit system** — singular, shared, table-driven/config-driven, not one instance per agent or per domain (frozen §23.4). Six agents are six rows of config against this shared infrastructure, not six codebases.
4. **Scheduling uses the platform's existing job mechanism first.** Concretely: Vercel Cron Jobs (or Supabase's `pg_cron` if Supabase Cron is enabled on the project) triggering deterministic sweep functions, per `CP360_SCHEDULED_OPERATING_EVENTS.md`. No dedicated workflow-orchestration product (Temporal, Airflow, etc.) and no message broker (SQS/RabbitMQ/Kafka) is introduced in this phase.
5. **Model routing stays a thin, provider-neutral function-call layer**, not a "multi-provider optimization service." The two existing Gemini calls migrate onto this layer as its first two callers; a second provider is added only if a real, measured need (cost, quality, or capability) requires it — never speculatively.
6. **Every one of the frozen architecture's explicit "Do Not Build" items** (§14 table, §23.5 list) is treated as a hard gate for this build: none may be introduced without a dedicated ADR containing problem, cheaper alternatives considered, measured evidence of need, expected cost, operational burden, and rollback plan (frozen §23.3/§14), and product-owner sign-off. This ADR itself is the template such future ADRs should follow.

## Consequences

**Positive:**
- Zero new deployment surfaces to operate, monitor, or pay for beyond what already exists — directly continues the current cost posture (Gemini free tier, Vercel/Supabase managed tiers) documented in `CP360_AI_COST_BASELINE.md`.
- No new class of production incident (no new database to back up, no new cluster to patch, no new network boundary to secure) during the highest-risk build phase (P1 audit/trust foundation).
- Matches how the codebase already works today — RLS-enforced Postgres access, Vercel serverless functions for the only server-side logic that exists — so new code is consistent with existing patterns reviewers and future contributors already understand, rather than introducing a second architectural style alongside the first.
- Logical module boundaries (written cleanly even though co-deployed) mean a genuine future extraction (e.g., pulling the scheduler into a dedicated worker once volume justifies it, per frozen §25 "Future Scale Triggers") is a boundary-respecting refactor, not a rewrite.

**Costs / risks accepted:**
- Vercel Serverless Functions have execution-time and statelessness constraints; a scheduler fan-out or a long agent-reasoning chain must be designed around those limits (e.g., short, idempotent, resumable steps; a workflow's "wait" state persisted in Postgres rather than held in function memory) rather than assuming a long-running worker process is available. This is a real design constraint, not free — accepted because it forces workflows to be durable/replayable by construction, which the frozen architecture wants anyway (§12: "support workflow replay").
- All new modules share one Postgres instance and one set of compute functions; a runaway or buggy SOP could in principle affect shared resources. Mitigated by the same RLS/role discipline already used everywhere else in the app, plus the audit/policy layer being P1 (built and enforced before any agent gets write authority) rather than an afterthought.
- If real measured load (workflow throughput, audit table growth, connector volume, knowledge search latency — the exact triggers listed in frozen §25) later crosses a documented threshold, physical extraction becomes appropriate. This ADR does not forbid that; it forbids doing it **speculatively, up front, before that evidence exists**.

## Alternatives Considered

1. **New dedicated "AI backend" service (separate repo/deployment).** Rejected: directly contradicts frozen §1 ("The AI workforce is native to CP360. No standalone DeckArc AI application") and §23.1 ("Do not create a greenfield app or parallel AI backend"), and duplicates auth/tenant/RLS machinery that already works.
2. **Workflow orchestration platform (Temporal/Airflow/Step Functions) from day one.** Rejected for this phase: no measured workflow-throughput evidence exists yet (there are, today, zero workflows) to justify it; frozen §25 explicitly ties this upgrade to a measured "workflow throughput exceeds existing job mechanism" trigger, not to anticipated future need.
3. **Message queue/broker for event fan-out.** Rejected for the same reason — frozen §14 explicitly disallows "multiple queues because 'enterprise'" and requires workload-class evidence before even a single dedicated queue, let alone several.
4. **Per-agent microservice (six agents, six deployables).** Rejected: contradicts frozen §14/§23.5 ("separate deployable service per agent" requires isolation/scaling/security evidence CP360 does not have), and would immediately violate the "shared runtime" cost-routing model in frozen §13.

## Rollback

If a specific module later needs physical extraction (e.g., the scheduler becomes a dedicated worker, or the Integration Gateway becomes its own service once connector volume justifies it per frozen §25), that is handled by a future, narrow ADR scoped to that one module, following the same "problem / cheaper alternatives / measured evidence / cost / rollback" template this ADR uses — not by reversing this decision wholesale. This ADR remains in force as the default for every module until superseded by such a module-specific extraction ADR.
