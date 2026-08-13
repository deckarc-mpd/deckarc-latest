/*
  # CP360 AI Operations Brain — Phase 8: Finance schema + Billing/AR/Margin Sweep SOP

  Frozen Architecture v4 Section 5: Finance is explicitly NOT a standalone
  AI agent in this phase. The deterministic services (Billing, AP, Collections,
  Margin, Cost Tracking, Cash Forecast) are owned by chief_of_staff (Avery) --
  documented rationale: cross-project financial exception synthesis is a
  cross-functional executive concern, matching Avery's existing "exception
  compression" role (Frozen Section 8) and the "Weekly Executive Portfolio
  Review" row already assigned to Chief of Staff in
  CP360_SCHEDULED_OPERATING_EVENTS.md, rather than a new agent identity.

  1. Schema additions (per ADR-CP360-AI-002's sanctioned lean-infra pattern:
     new Postgres tables/columns in the existing DB, no new deployable):
     - `projects.contract_amount` — did not exist anywhere; required for
       margin calculation (revenue - cost).
     - `vendor_bills` — accounts payable did not exist in any form. Minimal
       shape: what's owed to which vendor/subcontractor, when it's due,
       and its status. No payment execution capability -- this phase
       explicitly forbids autonomous bank/payment movement.
     - `project_cost_entries` — cost tracking did not exist in any form
       (materials has quantities, no dollar costs). Minimal shape: a
       dated, categorized cost line against a project.

  2. Registers billing_ar_margin_sweep_v1 in the SOP Registry and grants
     chief_of_staff the two new Controlled Tools it uses. This SOP is
     read-only -- like compliance_permit_inspection_sweep_v1, it never
     writes to a CP360 table and never creates an approval; it surfaces
     financial exceptions for human review only.
*/

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contract_amount numeric(12,2);

CREATE TABLE IF NOT EXISTS vendor_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  vendor_name text NOT NULL,
  bill_date date,
  due_date date,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Paid', 'Disputed')),
  dispute_notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vendor_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view vendor bills"
  ON vendor_bills FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')));

CREATE POLICY "Admins can manage vendor bills"
  ON vendor_bills FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')));

CREATE POLICY "Admins can update vendor bills"
  ON vendor_bills FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')));

CREATE TABLE IF NOT EXISTS project_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'Other',
  description text DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'other' CHECK (source IN ('material', 'labor', 'change_order', 'other')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_cost_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view project cost entries"
  ON project_cost_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')));

CREATE POLICY "Admins can manage project cost entries"
  ON project_cost_entries FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')));

UPDATE ai_agents
SET
  assigned_sops = assigned_sops || ARRAY['billing_ar_margin_sweep_v1'],
  allowed_tools = allowed_tools || ARRAY['compute_finance_assessment', 'interpret_finance_finding'],
  updated_at = now()
WHERE id = 'chief_of_staff'
  AND NOT ('billing_ar_margin_sweep_v1' = ANY(assigned_sops));

INSERT INTO ai_sops (id, version, owner_agent_id, title, description, trigger_event_types, execution_method, status)
VALUES (
  'billing_ar_margin_sweep_v1', '1.0.0', 'chief_of_staff',
  'Billing / AR / Margin Sweep',
  'Deterministically evaluates billing readiness, AR collections aging, AP status, project margin, and cash forecast for a project, using AI only to interpret ambiguous invoice/client/vendor dispute text or synthesize an explanation across multiple simultaneous financial exceptions. Read-only -- never moves money, never creates an approval. All billing math, due dates, margin calculations, and cash projections are deterministic code.',
  ARRAY['schedule.billing_ar_margin_sweep'], 'CODE', 'active'
)
ON CONFLICT (id) DO NOTHING;
