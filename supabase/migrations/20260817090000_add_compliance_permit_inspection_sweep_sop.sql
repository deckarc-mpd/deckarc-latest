/*
  # CP360 AI Operations Brain — Phase 7: Compliance Permit & Inspection Sweep SOP

  Registers compliance_permit_inspection_sweep_v1 (owner compliance / Clara)
  in the SOP Registry, and grants compliance the two new Controlled Tools it
  uses. No new tables -- Phase 7 reuses the Phase 1 audit/registry schema
  and reads EXISTING permits/inspections/user_profiles columns (permit_expiration_date,
  correction_required, license_expiration, coi_expiration, insurance_status)
  rather than adding new compliance-document schema. No dedicated
  project_inspection_requirements or W-9 table exists yet -- this slice
  tracks what's real and does not invent schema for what isn't.

  This SOP is read-only and never creates an approval -- it surfaces
  compliance exceptions for human review (Action Center) or for Project
  Ops to act on if a compliance dependency blocks scheduling; it never
  takes a consequential action itself.
*/

UPDATE ai_agents
SET
  assigned_sops = ARRAY['compliance_permit_inspection_sweep_v1'],
  allowed_tools = ARRAY['compute_compliance_readiness', 'interpret_compliance_finding'],
  updated_at = now()
WHERE id = 'compliance';

INSERT INTO ai_sops (id, version, owner_agent_id, title, description, trigger_event_types, execution_method, status)
VALUES (
  'compliance_permit_inspection_sweep_v1', '1.0.0', 'compliance',
  'Permit & Inspection Sweep',
  'Deterministically evaluates permit status/expiry, inspection correction/reinspection tracking, and COI/license expiry for a project, using AI only to interpret ambiguous correction notes or synthesize an explanation across multiple simultaneous gate failures. Read-only -- produces an audited assessment for human review, never an autonomous action.',
  ARRAY['schedule.compliance_permit_inspection_sweep'], 'CODE', 'active'
)
ON CONFLICT (id) DO NOTHING;
