/*
  # CP360 AI Operations Brain — Phase 2: Tomorrow Readiness SOP

  Registers the Phase 2 vertical-slice SOP (tomorrow_readiness_v1, owner
  project_operations / Marcus) in the SOP Registry created by
  supabase/migrations/20260812140000_create_ai_brain_foundation.sql, and
  grants project_operations the two new Controlled Tools it uses. No new
  tables — Phase 2 reuses the Phase 1 audit/registry schema exactly as
  designed (see docs/ai-brain/CP360_AI_IMPLEMENTATION_PLAN.md Phase 2).

  This SOP is read-only: it never writes a CP360 table, so it needs no new
  approval/authority schema beyond what Phase 1 already provides. See
  src/lib/aiBrain/sops/tomorrowReadiness.ts for the full design rationale.
*/

UPDATE ai_agents
SET
  assigned_sops = ARRAY['task_delay_cascade_v1', 'tomorrow_readiness_v1'],
  allowed_tools = ARRAY['cascade_delay', 'compute_tomorrow_readiness', 'interpret_field_update'],
  updated_at = now()
WHERE id = 'project_operations';

INSERT INTO ai_sops (id, version, owner_agent_id, title, description, trigger_event_types, execution_method, status)
VALUES (
  'tomorrow_readiness_v1', '1.0.0', 'project_operations',
  'Tomorrow Readiness',
  'Evaluates field-progress, dependency, subcontractor-coordination, and materials readiness gates deterministically for a project''s next scheduled work day, using AI only to interpret ambiguous free-text field reports or synthesize an explanation across multiple simultaneous gate failures. Read-only — produces an audited assessment for human review, never an autonomous action.',
  ARRAY['schedule.tomorrow_readiness_check'], 'CODE', 'active'
)
ON CONFLICT (id) DO NOTHING;
