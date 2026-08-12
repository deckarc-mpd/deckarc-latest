# CP360 Integration Permission Matrix — Gmail / Calendar / Drive

**Phase:** P0 deliverable (target-state design; no integration exists yet — see below).
**References:** `docs/ai-brain/brain.txt` §9 ("One Shared Integration Gateway"), §23.4–§23.5; `docs/ai-brain/employeeidentity.txt` (stable agent IDs); `ADR-CP360-AI-001_CANONICAL_SYSTEM.md`; `CP360_AI_PHASE0_DISCOVERY.md` §6.

## 0. Current State (as found in Phase 0)

**No Gmail, Google Calendar, or Google Drive integration exists in the codebase today.** `IntegrationSettingsPage.tsx` lists Calendar Sync as "Placeholder"; Gmail and Drive are not represented at all. There is no OAuth flow, no token storage, no connector code (`CP360_AI_PHASE0_DISCOVERY.md` §6). Everything below is the **target permission model** to build in P1–P3 (per `CP360_AI_IMPLEMENTATION_PLAN.md`'s sequencing notes), not a description of anything running today.

## 1. Governing Rules (from brain.txt §9, restated for this matrix)

1. **CP360 owns OAuth/token storage.** Tokens are obtained and refreshed server-side (Integration Gateway) and never transmitted to or held by the frontend, any AI employee, or any model call.
2. **One shared Integration Gateway** — a single connector layer for Gmail, Calendar, and Drive, shared by all six AI employees and all human users. No per-agent connector, no per-agent credential.
3. **Per-agent/per-SOP policy further restricts what can be read or written**, on top of the gateway's own scope grants — the gateway having a broad OAuth scope does not mean every agent/SOP can use all of it.
4. **CP360 remains canonical** (ADR-001) — Gmail/Calendar/Drive reads populate CP360 domain tables via an explicit workflow write; they are never read live as the current value of a fact by an agent mid-conversation.
5. **Connection is per-organization** (tenant), not per-user and not per-agent — consistent with the multi-company model in `CP360_AI_PHASE0_DISCOVERY.md` §3. A company (e.g., DeckArc LLC) connects its own Google Workspace once; all its users' and agents' access is scoped underneath that one connection.

## 2. Human Role × Integration Configuration Access

This governs who can **connect, disconnect, or reconfigure** the Google Workspace integration for an organization — i.e., who manages the OAuth grant itself, not who benefits from it. Mirrors the existing `IntegrationSettingsPage.tsx` admin-only gate (`CONVAZANT_SUPER_ADMIN`/`DECKARC_ADMIN` only, per that page's existing "Admin Access Only" notice) and existing RLS conventions.

| Role | Connect/disconnect Google Workspace | View connection status/health | View which agents/SOPs use it | Revoke a specific agent's tool access |
|---|---|---|---|---|
| `CONVAZANT_SUPER_ADMIN` | Yes (any org, via workspace support access) | Yes | Yes | Yes |
| `DECKARC_ADMIN` (company admin) | Yes (own org only) | Yes | Yes | Yes |
| `GENERAL_CONTRACTOR` | No | No | No | No |
| `SUBCONTRACTOR` | No | No | No | No |
| `CLIENT` | No | No | No | No |

## 3. AI Employee × Integration × Action Matrix

Each row uses the **stable `agent_id`** (employeeidentity.txt §3 naming rule — never the display name — for policy checks); display names shown for readability only. "Read" means the Integration Gateway may ingest and normalize events for that agent's SOPs to consume; "Send/Write" means the agent may execute a Controlled Tool that creates outbound activity, and is always subject to the Policy/Authority engine's CODE→AI→HUMAN routing (brain.txt §7) — a "Yes" below means "eligible to request," not "executes unsupervised." Consequential sends (client-facing email, calendar invites with external attendees) require human confirmation per brain.txt §19 unless a specific SOP has been promoted to L4 autonomy (brain.txt §24, P10).

| Agent (`agent_id`) | Display | Gmail — Read | Gmail — Send | Calendar — Read | Calendar — Write | Drive — Read | Drive — Write |
|---|---|---|---|---|---|---|---|
| `chief_of_staff` | Avery | Yes (exception-relevant threads only, via event abstraction — not full mailbox) | No (Avery synthesizes/prioritizes; does not send comms directly — that's Sales/Customer Success's job per brain.txt §4) | Yes (portfolio-level, for exception synthesis) | No | No | No |
| `sales` | Maya | Yes (leads/prospect threads) | Yes, draft only — human/L4-gated send (pipeline follow-up) | Yes (scheduling client calls/walkthroughs) | Yes, draft/propose only — human confirms | No | No |
| `estimating` | Daniel | Yes (scope/quote-related threads, read-only for interpretation) | No (Daniel is not responsible for "sales follow-up" per brain.txt §4) | No | No | Yes (plans, spec docs, comparable estimates) | No |
| `project_operations` | Marcus | Yes (subcontractor/material/field threads) | Yes, draft only — human confirms (trade confirmations, P3) | Yes (crew/inspection scheduling) | Yes, draft/propose only — human confirms | Yes (site photos, plans, material specs) | Yes, internal documents only (e.g., generated readiness reports), never client-visible without Customer Success/admin approval |
| `compliance` | Clara | Yes (permit/inspection/HOA correspondence) | Yes, draft only — human confirms (corrections, resubmissions) | Yes (inspection scheduling) | Yes, draft/propose only — human confirms | Yes (permits, COI, W-9, inspection reports) | Yes (uploading obtained permits/COI documents into `project_files`) |
| `customer_success` | Natalie | Yes (homeowner threads) | Yes, draft only — human/L4-gated send (progress updates, decisions, closeout) | Yes (client walkthroughs/milestones) | Yes, draft/propose only — human confirms (client-facing invites) | Yes (client-visible documents only, respecting existing `client_visible` flag conventions) | Yes, client-visible category only, subject to the same admin-approval-before-client-visible pattern already used by `project_files.internal_only` |

Notes:
- "Draft only — human confirms" reuses the exact pattern already prototyped (informally) in `api/voice-assistant.ts`'s `WRITE_TOOLS` confirmation flow (`CP360_AI_PHASE0_DISCOVERY.md` §5) — formalized in P1 as a real Policy/Authority + Approvals check rather than a hardcoded set.
- No agent ever receives raw Gmail/Calendar/Drive OAuth tokens (rule 1 above) — all access is via the shared gateway's server-side tool calls, audited per §5 below.
- Avery (Chief of Staff) intentionally has the narrowest write footprint — brain.txt §8 is explicit that the Chief of Staff is a compression/prioritization layer, not an executor.

## 4. Data-Scoping Rule (what "Read" actually means)

No agent or SOP receives a full mailbox/calendar/drive dump. Per brain.txt §9's normalization requirement, the Integration Gateway converts raw Gmail/Calendar/Drive activity into **normalized CP360 events**, and each agent/SOP subscribes only to the event types and project/organization scope relevant to its domain (e.g., Clara's compliance SOPs subscribe to permit/inspection-tagged correspondence, not the whole inbox). This is enforced at the event-routing layer (P1's event abstraction), not by trusting each agent to self-filter after receiving everything.

## 5. Audit Requirement (ties to employeeidentity.txt §7 and brain.txt §12)

Every Gmail/Calendar/Drive read or write performed on behalf of an agent must produce a Tool-call audit record carrying:
- the stable `agent_id` (never the display name) as the accountable actor,
- the display name/title at time of execution (for human-readable history),
- the external provider ID (Gmail message ID / Calendar event ID / Drive file ID) for traceability back to the source,
- correlation_id/workflow_id linking it to the SOP run that initiated it,
- for any Send/Write action, the Approval record (if human confirmation was required) referenced by ID.

## 6. Explicitly Out of Scope for This Matrix

- Non-Google integrations (SMS, QuickBooks, Payments, Weather, Permit Portal) — all currently "Placeholder"/"Simulated" per `IntegrationSettingsPage.tsx` and not part of the Gmail/Calendar/Drive brief this matrix covers.
- Per-user Gmail/Calendar/Drive personal connections (e.g., a subcontractor connecting their own personal Gmail) — the frozen architecture's Integration Gateway is organization-level, not user-level; nothing in brain.txt or the employee-identity brief calls for individual user OAuth grants, and Phase 0 found no such pattern anywhere in the existing app to extend.
