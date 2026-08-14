# CP360 Integration & Permission Matrix

Defines, for Phase 1+ implementers, which stable agent identities may use which controlled tools/integrations, at what authority level, per Frozen Architecture v4 §3–§4 (agent roles), §9 (Integration Gateway), §19 (voice authority), and the Identity spec (`employeeidentity.txt`). This is a **specification for what to build**, not a description of anything that exists — Phase 0 Discovery confirmed no agent registry, no Integration Gateway, and no Google connectors exist today.

All references to agents use **stable IDs** per the Identity spec (never display names) — display names shown in parentheses for readability only.

---

## 1. Authority Levels (per Frozen §7, §24)

| Level | Meaning |
|---|---|
| **L0 — No access** | Tool/integration not exposed to this agent at all. |
| **L1 — Read only** | Agent may call read tools; cannot propose or execute writes. |
| **L2 — Propose, human approves** | Agent may propose a write (email draft, calendar event, task update); a human must explicitly approve before execution. |
| **L3 — Execute with confirmation** | Agent may execute directly-requested, low-consequence writes after in-the-moment confirmation (matches the existing `VoiceAssistant.tsx` yes/no pattern, generalized and audited). |
| **L4 — Autonomous** | Agent executes without per-instance human confirmation. **Never granted by default** — frozen §21/§24: earned per-SOP only, after measured reliability/cost/rollback criteria are met (P10). No SOP in this matrix starts at L4. |

Per frozen §24: **autonomy is promoted per-SOP, never per-agent wholesale.** The matrix below states the *starting* authority level for each cell; promotion to L4 requires its own SOP-specific validation record, not a change to this matrix.

## 2. Agents × CP360 Internal Modules

CP360's own modules (Projects, Tasks, Permits, Inspections, Daily Updates, Change Orders, Payments, etc.) are accessed via **controlled tools**, not direct table access, once Phase 1 exists (Gap Analysis §1). This table defines intended access, referencing the existing tables found in Phase 0 Discovery.

| Agent (`stable_id`) | Projects/Tasks (read) | Projects/Tasks (write) | Permits/Inspections | Daily Updates | Change Orders / Payments | Client Decisions/Comms | Action Items / Audit |
|---|---|---|---|---|---|---|---|
| `chief_of_staff` (Avery) | L1 — reads synthesized exceptions only, never raw tables (frozen §8) | L0 | L1 (exceptions only) | L0 | L1 (exceptions only) | L1 (exceptions only) | L1 read, L2 to snooze/reassign |
| `sales` (Maya) | L0 (no project operational access) | L0 | L0 | L0 | L0 | L0 | L1 on sales-pipeline items only (`cp360_leads`) |
| `estimating` (Daniel) | L1 (project history for comparables) | L0 | L0 | L0 | L2 (propose pricing/estimate content; human authorizes) | L0 | L1 |
| `project_operations` (Marcus) | L1 read broad; L2 write (task status, schedule updates via `scheduleEngine.cascadeDelayFromTask` as a controlled tool, never direct table writes) | L2 | L2 (compliance-adjacent items require Clara review) | L1 read; L2 to flag/request | L0 (no finance authority) | L1 (dependency-relevant only) | L1 read, L2 write |
| `compliance` (Clara) | L1 (compliance-relevant fields only) | L0 | L2 (propose status/date updates; human/GC confirms) | L0 | L0 | L0 | L1 read, L2 write |
| `customer_success` (Natalie) | L1 (client-visible fields only — must respect existing `is_client_visible`/`client_visible_notes` gating already enforced in schema/RLS) | L0 | L1 (client-visible status only) | L0 | L1 read (client-visible payment status only, never internal cost/margin) | L2 (propose client update/draft; admin approves before send — matches frozen §11's "draft only" rule and the Scheduled Events 16:30 sweep) | L1 read, L2 write |

Notes:
- **Finance stays deterministic per frozen §5**: no agent gets write authority over `change_orders`/`payment_milestones` math; `estimating`/`customer_success` may read/propose narrative content only, never authorize amounts.
- **All L2 proposals route through the not-yet-built Policy/Authority engine** (Gap Analysis §1) — this matrix defines the *ceiling*, the policy engine enforces it at runtime per company/per-SOP.

## 3. Agents × Google Integration Gateway (Gmail / Calendar / Drive)

Per `ADR-CP360-AI-001_CANONICAL_SYSTEM.md`: Google surfaces are execution/evidence only. No agent ever holds a raw OAuth token — every row below is mediated by the shared Integration Gateway.

| Agent | Gmail — read | Gmail — send | Calendar — read | Calendar — create/update | Drive — read | Drive — write |
|---|---|---|---|---|---|---|
| `chief_of_staff` | L1 (normalized/triaged events only, not raw inbox) | L0 | L1 (normalized events only) | L0 | L0 | L0 |
| `sales` | L2 (lead-related threads, proposed replies) | L2 (drafts only; human sends until an SOP earns L3) | L1 (availability lookups for scheduling) | L2 (propose meeting/call invites) | L0 | L0 |
| `estimating` | L1 (estimate-related threads) | L0 | L0 | L0 | L1 (read plans/spec docs attached to a project) | L0 |
| `project_operations` | L1 (project/trade-related threads, normalized) | L2 (drafts to subs/vendors; human or an earned SOP-specific L3 sends) | L1 (project schedule visibility) | L2 (propose inspection/walkthrough events; human confirms until earned) | L1 (read permit/plan docs) | L2 (propose uploads — e.g., a daily photo batch — human/GC confirms until earned) |
| `compliance` | L1 (permit/inspection correspondence) | L2 (drafts to AHJ/inspectors; human sends) | L1 | L2 (propose inspection scheduling) | L1 (permit docs) | L2 (propose filing corrected docs) |
| `customer_success` | L1 (client threads, normalized) | L2 (drafts; admin approves before send — never L3 for anything client-facing without an earned, SOP-specific promotion, given reputational risk of an unreviewed client email) | L1 (client walkthrough scheduling) | L2 (propose walkthrough/milestone events; homeowner-facing writes always require human confirmation) | L1 (client-visible file folder only) | L2 (propose adding a client-visible file; human confirms) |

**No agent ever gets L3+ on an outbound Gmail send or a Drive write in the starting configuration.** Client- and vendor-facing external communication is judged higher-consequence than internal CP360 writes and starts more conservatively, consistent with frozen §7's HUMAN routing for "unusual judgment" and the reputational cost of an incorrect external message versus an incorrect internal status field.

## 4. Voice Authority (frozen §19)

Voice **never increases authority** — the matrix above applies identically whether the request arrives via UI, API, schedule, or voice. Additional voice-specific constraints, generalizing the existing `VoiceAssistant.tsx` yes/no pattern (Phase 0 Discovery §5, item 5):

| Data class | Voice behavior |
|---|---|
| Amounts, dates, project names | Require explicit read-back and confirmation before any write, regardless of the module's base authority level. |
| Approvals / commitments | Always L2 minimum via voice, even for actions that might be L3 via typed UI — spoken confirmation is treated as lower-confidence input than a typed/clicked one. |
| Any write | Requires an authenticated session (today's `voice-assistant.ts` accepting a client-supplied email string is a defect per Gap Analysis §10.2 — must be fixed to verify a real Supabase session token, matching the pattern `api/assistant.js` already uses correctly, before voice authority can be extended past the single current hardcoded admin). |
| Barge-in | Stops TTS and cancels/updates any pending unexecuted action — no action executes after a user interrupts mid-confirmation. |

## 5. Data Class × Role Visibility (existing constraint, restated for agent design)

Agents must respect the same data-visibility boundaries the existing RLS/UI already enforces for human roles of the equivalent type — an agent acting "as" `customer_success` must never surface what a `CLIENT`-role human couldn't see (internal notes, margin, supplier issues — the same `blockedTerms` list `AskCP360.tsx` already encodes for the client role today is a useful starting reference, though it should be re-implemented server-side/policy-side, not as a client-side keyword filter). Concretely:

| Data | Visible to agents acting for CLIENT-role context | Visible to agents acting for internal (GC/Admin) context |
|---|---|---|
| `internal_notes`, `client_visible_notes` split fields (already present on `projects`, `tasks`) | `client_visible_notes` only | Both |
| Cost/margin figures | Never | Yes, per role |
| Subcontractor performance/no-show detail | Never | Yes, per role |
| Permit/inspection raw correspondence | Summarized client-safe status only | Full detail |

## 6. Cross-Tenant Boundary

Every row above is additionally scoped by `organization_id` — an agent instance operating for one company's data must never read or write another company's rows, regardless of tool authority level. Phase 0 Discovery flagged that several existing RLS policies are broader than strict per-org filtering (Gap Analysis §13, item 5) — **closing that gap is a prerequisite for this matrix to be safely enforceable**, not a parallel task; the Controlled Tools layer should enforce org-scoping explicitly at the tool-call boundary even where underlying RLS is currently broad, so agent behavior is correct even before every RLS policy is tightened.

## 7. Review Cadence

This matrix is reviewed at the Monthly "Connector/Permission Audit" scheduled event (see `CP360_SCHEDULED_OPERATING_EVENTS.md`) — deterministically diffed against actual granted tool permissions in the (future) Agent Registry config, with any mismatch surfaced to a human admin, never auto-corrected by AI.
