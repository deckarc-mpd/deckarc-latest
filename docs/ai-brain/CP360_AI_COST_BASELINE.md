# CP360 AI Cost Baseline

Per Frozen Architecture v4 §23.3: *"Before proposing new infrastructure, document the current stack and cost-impact assumptions."* This document establishes the current, visible cost baseline from repository inspection, and the cost-impact template every future infrastructure proposal in this initiative must fill out. It does not authorize any new spend.

---

## 1. What Is Actually Visible From the Repository

No billing exports, invoices, or usage dashboards are checked into the repo (expected and correct — those live with the account owners, not in source control). What **is** verifiable from code and config:

| Component | Provider | Tier / plan evidence found | Notes |
|---|---|---|---|
| Frontend hosting + serverless functions | Vercel | `vercel.json` — standard Vite build + rewrites, no `crons`, no advanced config implying a paid-tier-specific feature is in use | 2 lightweight serverless functions (`api/assistant.js`, `api/voice-assistant.ts`), both short request/response proxies — low execution-time footprint. |
| Database + Auth + Storage | Supabase | Referenced only via `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` env vars; no `supabase/config.toml`, no self-hosting config | 68 migrations, seed data sized for demo/pilot use (5 test users, a handful of demo projects per seed migrations) — consistent with early-stage/pilot data volume, not production scale. |
| LLM provider | Google Gemini | `AI_ASSISTANT_SETUP.md` explicitly states *"which has a free tier"* and *"Gemini's free tier has rate limits... fine for a single admin's usage"*; model used is `gemini-3.5-flash-lite`, Google's cheapest/fastest tier | **Deliberately chosen for zero marginal cost.** Confirmed no paid API tier, no billing account wiring visible. |
| Speech-to-text / text-to-speech | Browser-native (`SpeechRecognition`, `speechSynthesis` Web Speech APIs) | Code comments in `AI_ASSISTANT_SETUP.md` and `VoiceAssistant.tsx` confirm this explicitly: *"No API key or cost — it's free and runs in the browser"* | Zero cost, but a real capability constraint: Chrome/Edge only, no server-side fallback, no usage outside those browsers. |
| Email / SMS | None (Simulated) | `IntegrationSettingsPage.tsx` marks both `Simulated` with notes pointing at SendGrid/Twilio as future options | $0 today because nothing is wired up, not because a paid tier is being avoided. |
| File storage | Supabase Storage (bundled with the Supabase plan above) | `phase5_file_vault_storage.sql`, `security_hardening_storage_rls.sql` migrations show buckets/RLS configured | No separate cost line — part of the Supabase plan. |
| Payments / QuickBooks / Weather / Permit portals | None (Placeholder) | `IntegrationSettingsPage.tsx` | $0 — not integrated. |

**Bottom line**: the current AI-adjacent cost is effectively **$0 in direct AI/voice spend**, riding entirely on free tiers (Gemini free tier, browser-native speech), on top of whatever the Vercel and Supabase plan levels already cost for hosting the rest of the app (not AI-specific, and not visible from this repository — must be confirmed with the account owner if a true current total is needed). This is exactly the "lean by default" posture `ADR-CP360-AI-002` commits to preserving.

## 2. Why This Matters for Phase 1+

The Frozen Architecture's cost-governance model (§13, §14) assumes a baseline of near-zero AI spend that any new capability must justify moving away from. Because the current baseline genuinely is near-zero, **every future AI call has a real, non-trivial relative cost increase** — there is no "it's already expensive, one more call doesn't matter" slack to hide behind. Two concrete implications for Phase 1+ design:

1. **The Gemini free tier's rate limits (`AI_ASSISTANT_SETUP.md`: "fine for a single admin's usage... worth knowing if it ever errors with a 429") will not survive scaling from one hardcoded admin user to six agents running scheduled sweeps across multiple companies.** A model/provider decision — stay on Gemini's paid tier, move to another provider, or introduce real request budgeting — must be made explicitly before Phase 1's scheduled sweeps (`CP360_SCHEDULED_OPERATING_EVENTS.md`) go live with real AI escalation, not discovered via production 429s.
2. **The deterministic-first design throughout this initiative (Gap Analysis §8, Scheduled Events §3) is not just an architecture preference — it is the actual cost-control mechanism.** Every sweep that correctly avoids an AI call when nothing material changed is directly avoiding real marginal spend once the free tier is exceeded or a paid tier is adopted. The "zero AI call if nothing changed" rule should be treated as a cost requirement with a measurable metric (calls avoided / calls made), not only a design principle.

## 3. Required Cost-Impact Template for Every New Component

Per frozen §23.3, every future proposal introducing new infrastructure (new tables are exempt — schema additions to the existing Supabase DB are not "new infrastructure" under `ADR-CP360-AI-002`; this applies to new services, new third-party dependencies, new paid tiers, new scheduled compute) must answer, before implementation:

| Question | |
|---|---|
| **Problem it solves** | What business/technical requirement, specifically, cannot be met without this? |
| **Why existing CP360 capability is insufficient** | Name the specific existing table/function/service considered and why it doesn't work (per Phase 0 Discovery's reuse inventory, §9). |
| **Simpler alternatives considered** | At minimum: "do it in the existing Vercel function," "do it as a Postgres/`pg_cron` job," "defer until measured need" — per `ADR-CP360-AI-002`. |
| **Current measured load or failure mode proving need** | A number, an error rate, a latency figure, or an explicit "not yet measured — this is provisioned ahead of evidence and requires explicit product-owner sign-off as an exception." |
| **Expected monthly fixed and variable cost** | Best estimate, stated in dollars, with the assumption set (e.g., "$X/month at Gemini's paid per-token rate assuming N scheduled sweeps/day across M companies at Y tokens/call"). |
| **Operational burden introduced** | Who monitors it, what happens on failure, does it need on-call attention. |
| **Exit / rollback plan** | How to turn it off / revert without data loss if it doesn't work out. |
| **Future metric that would trigger scaling further** | Ties back to frozen §25's Future Scale Triggers table — name the specific signal. |

This template is the same shape used in `ADR-CP360-AI-001` and `ADR-CP360-AI-002` above — new component proposals should be written as ADRs following that structure, not as ad hoc PR descriptions.

## 4. Baseline Cost Assumptions to Carry Into Phase 1 Planning

These are **planning assumptions**, not commitments, to be validated against real numbers once Phase 1 scopes actual sweep frequency and call volume:

- **LLM calls**: budget per-call cost by model tier (cheap/fast for classification & extraction, a higher tier only for synthesis/conflict-resolution tasks that genuinely need it) — matches frozen §13 Figure 9's `NO AI REQUIRED / SIMPLE AI / DEEPER AI` routing. No number is assumed yet; the first Phase 1 deliverable that touches model routing should establish real, measured per-call costs from actual provider pricing at build time (pricing changes over time and should not be hardcoded into this baseline document).
- **Scheduled sweep volume**: per `CP360_SCHEDULED_OPERATING_EVENTS.md`, most sweeps are daily or a few-times-daily and deterministic-first — the number of sweeps that actually reach an AI call should be a small fraction of total sweep executions if the deterministic-first design is implemented correctly. This ratio (AI-calls / sweep-executions) is itself a metric worth tracking from day one (ties to frozen §13's cost-governance metrics table).
- **Voice**: currently $0 (browser-native STT/TTS). If a future phase needs a server-side voice vendor (for browsers other than Chrome/Edge, or for phone-based voice), that is new spend requiring its own ADR under the template above — not assumed as free going forward.
- **Per-company/per-project cost tracking**: the frozen architecture's "Cost per company/project" unit-economics metric (§13) has no data source today (no AI cost logging exists at all — Phase 0 Discovery §11). This must be built as part of the audit/telemetry work in Phase 1, not bolted on later, since retrofitting cost attribution after agents are already running is materially harder than logging it from the first call.

## 5. Non-AI Hosting Cost Note

Vercel and Supabase plan-level costs (seats, bandwidth, database size/compute tier, storage) are **not AI-specific** and are outside this document's scope — they exist regardless of whether the AI Operations Brain is built at all, and are not visible from repository inspection. If a true current total cost figure is needed for planning, it should come directly from the Vercel and Supabase account billing pages, not be estimated here.
