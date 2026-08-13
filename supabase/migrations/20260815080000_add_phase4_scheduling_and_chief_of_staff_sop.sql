/*
  # CP360 AI Operations Brain — Phase 4: Scheduled Operating Rhythm + Chief of Staff

  1. Company-configurable scheduling (Frozen §11/§20, CP360_SCHEDULED_OPERATING_EVENTS.md §4)
     - `organizations.timezone` did not exist anywhere in the schema before
       this migration (confirmed gap, see that doc's §4) — every sweep must
       read a real per-company timezone instead of assuming one.
     - `organizations.default_allow_saturday_work` / `default_allow_sunday_work`
       give new projects a company-wide default, closing the gap noted in
       the same doc: `project_calendars` was project-only, with no
       company-level row a new project could inherit from.
     - `organizations.excluded_project_statuses` lets a company override
       which `projects.status` values a scheduled sweep skips, defaulting
       to the same list src/lib/aiBrain/scheduling/schedulingConfig.ts uses
       (`DEFAULT_EXCLUDED_PROJECT_STATUSES`) so behavior is identical until
       a company explicitly customizes it.

  2. Registers chief_of_staff_daily_synthesis_v1 (owner chief_of_staff / Avery)
     in the SOP Registry, and grants chief_of_staff the one Controlled Tool
     it uses. No new audit/registry tables — Phase 4 reuses the Phase 1
     schema exactly (see docs/ai-brain/CP360_AI_IMPLEMENTATION_PLAN.md Phase 4).
     Avery's SOP never reads a raw CP360 table directly — its trigger event
     payload carries already-resolved exceptions assembled by the caller
     (the scheduled sweep orchestrator, or a future on-demand refresh).
*/

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS default_allow_saturday_work boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_allow_sunday_work boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_project_statuses text[] NOT NULL DEFAULT ARRAY['Completed', 'Cancelled', 'Archived', 'On Hold'];

UPDATE ai_agents
SET
  assigned_sops = ARRAY['chief_of_staff_daily_synthesis_v1'],
  allowed_tools = ARRAY['synthesize_daily_brief'],
  updated_at = now()
WHERE id = 'chief_of_staff';

INSERT INTO ai_sops (id, version, owner_agent_id, title, description, trigger_event_types, execution_method, status)
VALUES (
  'chief_of_staff_daily_synthesis_v1', '1.0.0', 'chief_of_staff',
  'Chief of Staff Daily Synthesis',
  'Deterministically ranks resolved exceptions (critical/needs-review action items, sweep escalations) handed in by the caller -- never reads a raw CP360 table itself. Adds AI decision framing only when the ranked list is non-empty. Output is prioritization and framing, never routing or resolution (Frozen §8).',
  ARRAY['schedule.chief_of_staff_synthesis'], 'CODE', 'active'
)
ON CONFLICT (id) DO NOTHING;
