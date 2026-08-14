# CP360 AI Operations Brain — Phase 0-9 Testing Guide

This is the test plan for everything built across Phases 0-9: the automated
suite that runs with zero external dependencies, and a manual UI walkthrough
for every feature now wired into the live product. Follow the automated
section first — it catches the vast majority of real bugs in seconds. The
manual section is for confirming the UI itself renders and wires up
correctly against a real Supabase project.

## 1. Automated verification (no live Supabase/Gemini required)

Run from the repo root:

```bash
npm run test:aibrain   # 297 tests — every domain's deterministic logic,
                        # SOP handlers, groundedness checks, and exit gates
npm run typecheck       # tsc --noEmit -p tsconfig.app.json
node ./node_modules/eslint/bin/eslint.js src   # npm run lint resolves to a
                                                 # mismatched global ESLint
                                                 # in some environments —
                                                 # invoke the local one directly
```

All three must pass clean (test suite: 297/297; typecheck/lint: no new
errors beyond the project's pre-existing baseline — see below).

Note: `api/` (the Vercel serverless functions) is not covered by
`tsconfig.app.json`'s `include`, so `npm run typecheck` does not type-check
it. This is a pre-existing gap in the project's tsconfig, not something
introduced by this work. If you want to sanity-check the `api/` files
yourself, point `tsc` at them directly with a throwaway config:

```bash
cat > tsconfig.api-check.json <<'EOF'
{ "compilerOptions": { "target": "ES2022", "lib": ["ES2023"], "module": "ESNext",
  "moduleResolution": "bundler", "allowImportingTsExtensions": true,
  "isolatedModules": true, "moduleDetection": "force", "noEmit": true,
  "strict": true, "esModuleInterop": true }, "include": ["api/**/*.ts"] }
EOF
node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.api-check.json
rm tsconfig.api-check.json
```

You'll see a handful of `req.json()` returns `unknown` errors — that's a
pattern shared by every API route in this codebase (including ones from
Phase 4), not a defect in the new files.

### What each phase's automated tests actually prove

| Phase | Domain | What the tests prove |
|---|---|---|
| 0 | Discovery | N/A — documentation only |
| 1-2 | Audit/workflow/tools/policy engine + Tomorrow Readiness | Every audited action round-trips through the same tool/audit/workflow path; readiness gates match hand-computed expectations across 5 project fixtures |
| 3 | Trade & Material Coordination | Cross-project material/crew risk detection; escalation only via the approval mechanism, never an auto-send |
| 4 | Scheduling, Chief of Staff, Action Center, Command Center | Sweep window/timezone math; six-queue classification is exhaustive and non-overlapping |
| 5 | Customer Success client comms | Every draft is independently checked against verified fact anchors — an ungrounded draft fails the run before it ever reaches an approval queue |
| 6 | Voice adapter | Low-confidence/consequential utterances require read-back *before* any workflow run exists; unauthenticated sessions are rejected outright |
| 7 | Compliance | Permit/inspection/COI gates match hand-computed expectations; AI can explain a failure but never change whether one occurred |
| 8 | Finance | Billing/collections/AP/margin/cash-forecast math is 100% deterministic; fixtures deliberately probe multi-gate AI-invocation thresholds |
| 9 | Sales + Estimator | Stale-lead detection and follow-up groundedness; pricing recommendation never creates an approval and never calls a write-capable tool |

## 2. Manual UI walkthrough (requires a real Supabase project + env vars)

These require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set for the
Vercel functions, and the migrations in `supabase/migrations/` applied
(specifically the ones added in Phases 4, 5, 7, 8, 9 — search for
`ai_brain_foundation`, `client_communication_draft`,
`compliance_permit_inspection_sweep`, `finance_schema_and_sweep_sop`, and
`sales_estimating_sops`). `GEMINI_API_KEY` is optional — every AI-tier
client degrades to a deterministic fallback if it's unset, so every feature
below is testable without it; set it if you want to see real model output
instead of the template/keyword-classifier fallback.

### 2.1 Command Center & Action Center (Phase 4)

1. Log in as `DECKARC_ADMIN` or `GENERAL_CONTRACTOR`.
2. Sidebar → **Today** group → **Command Center**. Confirm it renders
   without error (it reads the persisted daily-synthesis record — empty is
   expected until a sweep has actually run once).
3. Sidebar → **Action Center**. Confirm the six queues render (Needs My
   Decision, Critical Now, Blocked, AI Handling, Watching, Completed), each
   with a `0` count and "Nothing here" until real exceptions exist.
4. To generate real data here, either wait for the hourly Vercel Cron
   (`api/cron/scheduled-sweep.ts`) to fire, or invoke it manually:
   `curl -X POST https://<your-deployment>/api/cron/scheduled-sweep`
   (add `-H "Authorization: Bearer $CRON_SECRET"` if `CRON_SECRET` is set).
   Confirm the JSON response lists which of the 5 sweeps ran and how many
   exceptions each found.
5. If any sweep escalates (Trade & Material Coordination, or Sales
   Pipeline Hygiene with a stale lead), a **Needs My Decision** item
   appears in Action Center with working Approve/Reject buttons.

### 2.2 AI Compliance (Phase 7)

1. Open any project → **Permits & Inspections** tab.
2. Click the new **AI Compliance** sub-tab (visible to admin/GC, not
   client/sub).
3. Click **Run Compliance Check**. Confirm it shows an Overall Status
   badge (Ready/At Risk/Blocked) and the three gates (permit status,
   inspection readiness, COI/W-9) with their findings.
4. To see the AI Explanation card, the project needs either 2+ failed
   gates or a permit/inspection with non-empty `correction_notes` — check
   a project's Permits tab for one with correction notes, or add one.

### 2.3 AI Finance (Phase 8)

1. Open any project → **Payments** tab (admin-only).
2. Click **AI Finance Check** to expand the panel, then **Run Check**.
3. Confirm Margin and 30-Day Cash Forecast figures render, plus all five
   gates (billing, collections, AP, margin, cash forecast).
4. This never creates an approval — there's nothing to approve/reject
   here by design (Frozen §5: no autonomous bank/payment movement).

### 2.4 AI Client Update Drafts (Phase 5)

1. Open a project with at least one open `client_decisions` row or a
   client-visible `project_delay_reasons` row → **Communication** tab
   (admin-only).
2. Click **Check for Updates Needed**.
3. If nothing qualifies, confirm it says so. If something qualifies,
   confirm a drafted subject/body renders, and that **Approve** /
   **Reject** buttons appear and work (approving calls the same
   `decide-approval` endpoint Action Center uses).
4. Confirm the draft always contains the actual decision title / delay
   date it was built from — that's the groundedness guarantee Phase 5's
   tests already prove at the unit level; this is the visual confirmation.

### 2.5 AI Sales Pipeline Hygiene (Phase 9)

1. Log in as `CONVAZANT_SUPER_ADMIN` → **CP360 Leads**.
2. Click **Check Pipeline** in the new panel at the top of the page.
3. Confirm it reports a stale-lead count. For any stale lead, confirm a
   drafted follow-up (subject + body naming the lead) renders below it.
4. If any drafts were produced, confirm **Approve**/**Reject** work.
5. To force a stale finding for testing, edit a lead's `created_at` in
   Supabase to be several days in the past while leaving its status as
   `new` or `contacted`.

### 2.6 AI Estimate (Phase 9)

1. Log in as `DECKARC_ADMIN` → sidebar → **Operations** group → **AI
   Estimate**.
2. Enter a free-text scope, e.g. *"Client wants a full kitchen renovation
   with new cabinets and an island"*, click **Get AI Estimate**.
3. Confirm it shows the classified category and, if your organization has
   2+ completed projects of that type with cost entries, a proposed price
   range with comparable count / median contract / average margin.
4. With fewer than 2 comparables, confirm it shows the amber
   "not enough data" state instead of guessing a range.
5. Nothing here sets a price on any project — by design, there is no such
   action anywhere in this flow.

### 2.7 Voice (Phase 6)

Voice has no dedicated new UI beyond the existing `VoiceAssistant`
component wired in `Layout.tsx` — Phase 6 is architecture (name
resolution, intent classification, confidence gating, barge-in), all
exercised by its 40+ automated tests. Manual testing here means using the
existing voice assistant UI and confirming: a request naming an amount,
date, project, or approval gets a read-back confirmation before anything
executes, and interrupting speech cancels any pending unexecuted action.

## 3. Known sandbox-only limitations (not product defects)

- Every `Gemini*Client`/`Gemini*Interpreter` class and every
  `api/ai-brain/*.ts` route is labeled in its own file header as **not
  exercised against a live model or live Supabase from the development
  sandbox** — they were verified by (a) unit tests against the
  deterministic fallback path, and (b) manual code review of the REST
  request/response shape against Gemini's documented API. Confirming they
  work against your actual `GEMINI_API_KEY` is part of this manual pass.
- `api/cron/scheduled-sweep.ts` was checked column-by-column against the
  real migrations, and its query shapes reuse the exact `Readiness*` types
  every fixture-based unit test already proves correct — but, like the
  Gemini clients, it has not been run against a live Supabase project from
  this sandbox.
