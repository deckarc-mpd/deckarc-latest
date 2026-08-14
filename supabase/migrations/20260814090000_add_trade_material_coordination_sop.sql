/*
  # CP360 AI Operations Brain — Phase 3: Trade & Material Coordination SOP

  Registers trade_material_coordination_v1 (owner project_operations /
  Marcus) in the SOP Registry, and grants project_operations the one new
  Controlled Tool it uses. No new tables — Phase 3 reuses the Phase 1
  audit/registry schema and the Phase 2 interpret_field_update tool exactly
  as designed (see docs/ai-brain/CP360_AI_IMPLEMENTATION_PLAN.md Phase 3).

  Escalation to a human (this SOP's third capability) is implemented via
  the existing ai_approvals mechanism, not a new schema concept — see
  src/lib/aiBrain/sops/tradeMaterialCoordination.ts for the full design
  rationale, including why 'approved' and 'rejected' both resolve this
  SOP to 'completed' (unlike task_delay_cascade_v1's approval, there is no
  write to accept or reject here — either answer means a human has
  reviewed the detected issue).
*/

UPDATE ai_agents
SET
  assigned_sops = ARRAY['task_delay_cascade_v1', 'tomorrow_readiness_v1', 'trade_material_coordination_v1'],
  allowed_tools = ARRAY[
    'cascade_delay',
    'compute_tomorrow_readiness',
    'interpret_field_update',
    'assess_trade_material_coordination'
  ],
  updated_at = now()
WHERE id = 'project_operations';

INSERT INTO ai_sops (id, version, owner_agent_id, title, description, trigger_event_types, execution_method, status)
VALUES (
  'trade_material_coordination_v1', '1.0.0', 'project_operations',
  'Trade & Material Coordination',
  'Deterministically checks which crews are unconfirmed past the trade confirmation cutoff and which materials threaten a not-yet-started task or its downstream dependents. Escalates to a human when either finding is real (no automated outreach exists yet — see ADR-CP360-AI-001) — never autonomous.',
  ARRAY['schedule.trade_confirmation_cutoff'], 'CODE', 'active'
)
ON CONFLICT (id) DO NOTHING;
