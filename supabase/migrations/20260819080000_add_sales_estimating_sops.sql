/*
  # CP360 AI Operations Brain — Phase 9: Sales + Estimator SOPs

  Registers sales_pipeline_hygiene_v1 (owner sales / Maya) and
  estimate_pricing_recommendation_v1 (owner estimating / Daniel) in the
  SOP Registry, and grants each agent its two new Controlled Tools. No new
  tables -- reads the EXISTING cp360_leads table (Sales) and completed
  projects.contract_amount (Phase 8) plus project_cost_entries (Phase 8)
  for the Estimator's comparable/history lookup.

  Neither SOP writes to a CP360 table. sales_pipeline_hygiene_v1 gates any
  non-empty, fully-grounded follow-up batch behind the existing
  ai_approvals mechanism (same pattern as client_communication_draft_v1).
  estimate_pricing_recommendation_v1 never creates an approval at all --
  it only proposes a price range; final price authorization stays
  human-only and happens entirely outside this SOP (Frozen §7).
*/

UPDATE ai_agents
SET
  assigned_sops = assigned_sops || ARRAY['sales_pipeline_hygiene_v1'],
  allowed_tools = allowed_tools || ARRAY['identify_stale_leads', 'draft_lead_followup'],
  updated_at = now()
WHERE id = 'sales'
  AND NOT ('sales_pipeline_hygiene_v1' = ANY(assigned_sops));

UPDATE ai_agents
SET
  assigned_sops = assigned_sops || ARRAY['estimate_pricing_recommendation_v1'],
  allowed_tools = allowed_tools || ARRAY['normalize_project_scope', 'find_comparable_pricing'],
  updated_at = now()
WHERE id = 'estimating'
  AND NOT ('estimate_pricing_recommendation_v1' = ANY(assigned_sops));

INSERT INTO ai_sops (id, version, owner_agent_id, title, description, trigger_event_types, execution_method, status)
VALUES (
  'sales_pipeline_hygiene_v1', '1.0.0', 'sales',
  'Sales Pipeline Hygiene',
  'Deterministically identifies stale cp360_leads, then drafts nuanced follow-up text for stale leads only. A draft that never names the lead fails the run outright. Every non-empty, fully-grounded batch requires company admin approval before use.',
  ARRAY['schedule.sales_pipeline_hygiene'], 'CODE', 'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_sops (id, version, owner_agent_id, title, description, trigger_event_types, execution_method, status)
VALUES (
  'estimate_pricing_recommendation_v1', '1.0.0', 'estimating',
  'Estimate Pricing Recommendation',
  'Normalizes free-text project scope into a known category (AI only when ambiguous), then deterministically computes a pricing range from real completed-project comparables. Never sets or authorizes a price.',
  ARRAY['schedule.estimate_pricing_recommendation'], 'CODE', 'active'
)
ON CONFLICT (id) DO NOTHING;
