/*
  # CP360 AI Operations Brain — Phase 5: Client Communication Draft SOP

  Registers client_communication_draft_v1 (owner customer_success / Natalie)
  in the SOP Registry, and grants customer_success the two new Controlled
  Tools it uses. No new tables — Phase 5 reuses the Phase 1 audit/registry
  schema exactly, and reads the EXISTING client_decisions and
  project_delay_reasons tables (specifically project_delay_reasons'
  already-vetted client_safe_reason/client_visible columns, never
  internal_reason) rather than adding new schema for verified facts.

  Every non-empty, fully-grounded batch of drafts requires company admin
  approval via the existing ai_approvals mechanism (same pattern as
  trade_material_coordination_v1) — this SOP never sends anything itself;
  no email/SMS integration exists yet (ADR-CP360-AI-001).
*/

UPDATE ai_agents
SET
  assigned_sops = ARRAY['client_communication_draft_v1'],
  allowed_tools = ARRAY['gather_verified_client_facts', 'draft_client_communication'],
  updated_at = now()
WHERE id = 'customer_success';

INSERT INTO ai_sops (id, version, owner_agent_id, title, description, trigger_event_types, execution_method, status)
VALUES (
  'client_communication_draft_v1', '1.0.0', 'customer_success',
  'Client Communication Draft',
  'Deterministically finds open client_decisions and client-visible project_delay_reasons, then drafts client-facing message text from verified fact anchors only -- never raw table access. A draft that omits or contradicts a verified fact fails the run outright. Every non-empty, fully-grounded batch requires company admin approval before use.',
  ARRAY['schedule.client_communication_check'], 'CODE', 'active'
)
ON CONFLICT (id) DO NOTHING;
