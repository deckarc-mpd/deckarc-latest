/*
  # CP360 AI Operations Brain — Phase 1 Foundation Schema

  Implements the correlated Universal Audit system, Agent/SOP Registry, and
  Feature Flags required by Frozen Architecture v4 §12 (Universal Audit),
  §3-4 (Agent Registry), and §14/§23.4 (one shared, config-driven layer,
  not one per agent/department). See docs/ai-brain/CP360_AI_GAP_ANALYSIS.md
  §1 and docs/ai-brain/CP360_AI_IMPLEMENTATION_PLAN.md Phase 1.

  ## Design notes
  - Reuses the existing `organizations` table as `company_id` (Phase 0
    discovery: `organizations` already is CP360's tenant/company concept;
    no new tenant table is introduced) and the existing `projects`/
    `user_profiles` tables — no new database, per ADR-CP360-AI-002.
  - Every audit-adjacent table carries `company_id` + `project_id` +
    `correlation_id`, matching Frozen §12's minimum audit fields exactly.
  - Physically separate, correlated tables per record type (Event, Workflow
    run, Agent run, Tool call, Approval, State change, Human override,
    Verification) rather than one giant polymorphic table, per Frozen §12:
    "physically use correlated record types, not necessarily one giant table."
  - RLS is enabled on every table below, but deliberately has NO insert/
    update policy for `authenticated`/`anon` roles. This is the direct fix
    to the Phase 0 gap-analysis finding that `activity_log` accepts
    `WITH CHECK (true)` client-trusted writes (CP360_AI_GAP_ANALYSIS.md §1,
    §10.6): every write to these tables must go through the server-side
    Controlled Tool / audit gateway (a Vercel Serverless Function using the
    Supabase service-role key, which bypasses RLS by design), never directly
    from the browser's anon-key session. Reads remain RLS-gated per role/org
    so the existing admin UI can query audit history safely.
  - Registry tables (`ai_agents`, `ai_sops`) are platform configuration, not
    per-tenant data, and are seeded below with the six frozen agents from
    docs/ai-brain/employeeidentity.txt. Same no-client-write posture applies.

  ## New tables
  1. ai_events               — Event
  2. ai_workflow_runs        — Workflow run
  3. ai_agent_runs           — Agent run
  4. ai_tool_calls           — Tool call
  5. ai_approvals            — Approval
  6. ai_state_changes        — State change
  7. ai_human_overrides      — Human override
  8. ai_verifications        — Verification
  9. ai_agents               — Agent Registry (six frozen agents seeded)
  10. ai_sops                — SOP Registry
  11. ai_feature_flags       — Feature flags, company-scoped with global default

  ## Security
  - RLS enabled on every table.
  - SELECT: CONVAZANT_SUPER_ADMIN (all rows) and DECKARC_ADMIN-equivalent
    company admins (their own company_id only) for audit tables; registry
    and flags are readable by any authenticated admin role.
  - INSERT/UPDATE/DELETE: none granted to `authenticated`/`anon`. All writes
    happen server-side via the service role key.
*/

-- ============================================================
-- 1. EVENT
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  correlation_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('ui', 'schedule', 'voice', 'email', 'api', 'system')),
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'agent', 'schedule', 'system')),
  actor_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_events_correlation ON ai_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ai_events_company ON ai_events(company_id);

ALTER TABLE ai_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai events"
  ON ai_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND (
        user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        OR (user_profiles.role = 'DECKARC_ADMIN' AND user_profiles.organization_id = ai_events.company_id)
      )
    )
  );

-- ============================================================
-- 2. WORKFLOW RUN
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  correlation_id uuid NOT NULL,
  sop_id text NOT NULL,
  sop_version text NOT NULL,
  trigger_event_id uuid NOT NULL REFERENCES ai_events(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  waiting_on text,
  due_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_correlation ON ai_workflow_runs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_company ON ai_workflow_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_status ON ai_workflow_runs(status);

ALTER TABLE ai_workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai workflow runs"
  ON ai_workflow_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND (
        user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        OR (user_profiles.role = 'DECKARC_ADMIN' AND user_profiles.organization_id = ai_workflow_runs.company_id)
      )
    )
  );

-- ============================================================
-- 3. AGENT RUN
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  correlation_id uuid NOT NULL,
  workflow_run_id uuid NOT NULL REFERENCES ai_workflow_runs(id),
  agent_id text NOT NULL,
  provider text,
  model text,
  model_version text,
  structured_proposal jsonb,
  evidence_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_workflow ON ai_agent_runs(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_correlation ON ai_agent_runs(correlation_id);

ALTER TABLE ai_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai agent runs"
  ON ai_agent_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND (
        user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        OR (user_profiles.role = 'DECKARC_ADMIN' AND user_profiles.organization_id = ai_agent_runs.company_id)
      )
    )
  );

-- ============================================================
-- 4. TOOL CALL
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  correlation_id uuid NOT NULL,
  workflow_run_id uuid REFERENCES ai_workflow_runs(id),
  agent_run_id uuid REFERENCES ai_agent_runs(id),
  tool_name text NOT NULL,
  action text NOT NULL,
  authorized_actor_type text NOT NULL CHECK (authorized_actor_type IN ('human', 'agent', 'schedule', 'system')),
  authorized_actor_id text NOT NULL,
  request_hash text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text,
  external_id text,
  result jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  dry_run boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_workflow ON ai_tool_calls(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_correlation ON ai_tool_calls(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_request_hash ON ai_tool_calls(request_hash);

ALTER TABLE ai_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai tool calls"
  ON ai_tool_calls FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND (
        user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        OR (user_profiles.role = 'DECKARC_ADMIN' AND user_profiles.organization_id = ai_tool_calls.company_id)
      )
    )
  );

-- ============================================================
-- 5. APPROVAL
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  correlation_id uuid NOT NULL,
  workflow_run_id uuid NOT NULL REFERENCES ai_workflow_runs(id),
  payload_hash text NOT NULL,
  payload_version text NOT NULL DEFAULT '1.0',
  approver_user_id uuid REFERENCES user_profiles(id),
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'rejected')),
  channel text NOT NULL CHECK (channel IN ('ui', 'voice', 'email', 'api')),
  decided_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_approvals_workflow ON ai_approvals(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_approvals_correlation ON ai_approvals(correlation_id);

ALTER TABLE ai_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai approvals"
  ON ai_approvals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND (
        user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        OR (user_profiles.role = 'DECKARC_ADMIN' AND user_profiles.organization_id = ai_approvals.company_id)
      )
    )
  );

-- ============================================================
-- 6. STATE CHANGE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_state_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  correlation_id uuid NOT NULL,
  workflow_run_id uuid REFERENCES ai_workflow_runs(id),
  object_type text NOT NULL,
  object_id text NOT NULL,
  before jsonb,
  after jsonb,
  reason text NOT NULL DEFAULT '',
  source text NOT NULL CHECK (source IN ('ui', 'schedule', 'voice', 'email', 'api', 'system')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_state_changes_workflow ON ai_state_changes(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_state_changes_correlation ON ai_state_changes(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ai_state_changes_object ON ai_state_changes(object_type, object_id);

ALTER TABLE ai_state_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai state changes"
  ON ai_state_changes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND (
        user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        OR (user_profiles.role = 'DECKARC_ADMIN' AND user_profiles.organization_id = ai_state_changes.company_id)
      )
    )
  );

-- ============================================================
-- 7. HUMAN OVERRIDE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_human_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  correlation_id uuid NOT NULL,
  workflow_run_id uuid REFERENCES ai_workflow_runs(id),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  action_overridden text NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_human_overrides_workflow ON ai_human_overrides(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_human_overrides_correlation ON ai_human_overrides(correlation_id);

ALTER TABLE ai_human_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai human overrides"
  ON ai_human_overrides FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND (
        user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        OR (user_profiles.role = 'DECKARC_ADMIN' AND user_profiles.organization_id = ai_human_overrides.company_id)
      )
    )
  );

-- ============================================================
-- 8. VERIFICATION
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  correlation_id uuid NOT NULL,
  workflow_run_id uuid NOT NULL REFERENCES ai_workflow_runs(id),
  expected_outcome jsonb NOT NULL,
  observed_outcome jsonb NOT NULL,
  success boolean NOT NULL,
  mismatch_notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_verifications_workflow ON ai_verifications(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_correlation ON ai_verifications(correlation_id);

ALTER TABLE ai_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai verifications"
  ON ai_verifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND (
        user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        OR (user_profiles.role = 'DECKARC_ADMIN' AND user_profiles.organization_id = ai_verifications.company_id)
      )
    )
  );

-- ============================================================
-- 9. AGENT REGISTRY
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_agents (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  official_title text NOT NULL,
  business_domain text NOT NULL,
  mission text NOT NULL,
  responsibilities text[] NOT NULL DEFAULT '{}',
  assigned_sops text[] NOT NULL DEFAULT '{}',
  allowed_tools text[] NOT NULL DEFAULT '{}',
  data_permissions text[] NOT NULL DEFAULT '{}',
  authority_level text NOT NULL DEFAULT 'L1' CHECK (authority_level IN ('L0', 'L1', 'L2', 'L3', 'L4')),
  escalation_policy text NOT NULL DEFAULT '',
  model_policy text NOT NULL DEFAULT '',
  cost_budget_monthly_usd numeric NOT NULL DEFAULT 0,
  cost_budget_per_call_usd numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  version text NOT NULL DEFAULT '1.0.0',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai agents"
  ON ai_agents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- Seed the six frozen agents (docs/ai-brain/employeeidentity.txt).
-- Display name/title are presentation identity ONLY — business logic must
-- reference `id`, never `display_name` (Identity spec "Do NOT create
-- business logic such as if agent_name == 'Avery'").
INSERT INTO ai_agents (
  id, display_name, official_title, business_domain, mission, responsibilities,
  assigned_sops, allowed_tools, data_permissions, authority_level,
  escalation_policy, model_policy, cost_budget_monthly_usd, cost_budget_per_call_usd,
  status, version
) VALUES
  (
    'chief_of_staff', 'Avery', 'AI Chief of Staff', 'Executive Operations',
    'Executive intelligence, prioritization, exception compression, cross-functional awareness, and decision preparation.',
    ARRAY['Executive priorities', 'Exception compression', 'Decision preparation', 'Morning/end-of-day synthesis'],
    ARRAY[]::text[], ARRAY[]::text[], ARRAY['exception_records', 'action_items'],
    'L1', 'Escalate unresolved critical items to company admin.', 'cheapest-tier synthesis model',
    0, 0, 'active', '1.0.0'
  ),
  (
    'sales', 'Maya', 'AI Sales Manager', 'Revenue',
    'Lead intake, qualification, follow-up, pipeline management, and sales handoff.',
    ARRAY['Lead intake', 'Qualification', 'Follow-up', 'Pipeline progression'],
    ARRAY[]::text[], ARRAY[]::text[], ARRAY['cp360_leads'],
    'L1', 'Escalate stalled/high-value leads to company admin.', 'cheapest-tier classification model',
    0, 0, 'active', '1.0.0'
  ),
  (
    'estimating', 'Daniel', 'AI Estimating Manager', 'Estimating / Revenue',
    'Scope interpretation, historical cost intelligence, estimating, pricing recommendations, assumptions, exclusions, and estimate analysis.',
    ARRAY['Scope normalization', 'Estimate reasoning', 'Comparable/history analysis', 'Pricing recommendation'],
    ARRAY[]::text[], ARRAY[]::text[], ARRAY['project_history', 'estimate_history'],
    'L1', 'Escalate final price authorization to company admin.', 'mid-tier reasoning model',
    0, 0, 'active', '1.0.0'
  ),
  (
    'project_operations', 'Marcus', 'AI Project Operations Manager', 'Operations',
    'Project execution, schedule readiness, subcontractor coordination, materials, field progress, dependencies, risks, delays, and tomorrow readiness.',
    ARRAY['Field updates', 'Dependencies', 'Trades', 'Materials', 'Risks', 'Tomorrow readiness'],
    ARRAY[]::text[], ARRAY[]::text[], ARRAY['tasks', 'daily_updates', 'materials', 'crew_confirmations', 'schedule_change_log'],
    'L2', 'Escalate consequential schedule commitments to company admin.', 'cheapest-tier extraction model, mid-tier for synthesis',
    0, 0, 'active', '1.0.0'
  ),
  (
    'compliance', 'Clara', 'AI Compliance Manager', 'Compliance',
    'HOA, zoning, permits, inspections, corrections, COI/W-9, and regulatory/compliance documentation.',
    ARRAY['Permit tracking', 'Inspection sequencing', 'Corrections', 'Compliance documentation'],
    ARRAY[]::text[], ARRAY[]::text[], ARRAY['permits', 'inspections', 'project_inspection_requirements'],
    'L1', 'Escalate rejected/failed compliance items to company admin.', 'cheapest-tier extraction model',
    0, 0, 'active', '1.0.0'
  ),
  (
    'customer_success', 'Natalie', 'AI Customer Success Manager', 'Customer Success',
    'Verified client communication, decisions, selections, closeout, warranty/reviews.',
    ARRAY['Client communication', 'Decisions', 'Selections', 'Closeout', 'Warranty transition'],
    ARRAY[]::text[], ARRAY[]::text[], ARRAY['client_decisions', 'communication_log'],
    'L1', 'All client-facing sends require company admin approval.', 'mid-tier drafting model',
    0, 0, 'active', '1.0.0'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 10. SOP REGISTRY
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_sops (
  id text PRIMARY KEY,
  version text NOT NULL DEFAULT '1.0.0',
  owner_agent_id text NOT NULL REFERENCES ai_agents(id),
  title text NOT NULL,
  description text NOT NULL,
  trigger_event_types text[] NOT NULL DEFAULT '{}',
  execution_method text NOT NULL CHECK (execution_method IN ('CODE', 'AI', 'HUMAN')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_sops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai sops"
  ON ai_sops FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- Phase 1's single vertical-slice SOP (CP360_AI_IMPLEMENTATION_PLAN.md Phase 1
-- exit gate). Deterministic CODE tier — no LLM call, per Frozen §7's "can
-- deterministic code do it reliably and completely? YES -> CODE" branch.
INSERT INTO ai_sops (id, version, owner_agent_id, title, description, trigger_event_types, execution_method, status)
VALUES (
  'task_delay_cascade_v1', '1.0.0', 'project_operations',
  'Task Delay Cascade',
  'When a task is reported delayed, deterministically cascades the delay to dependent tasks (reusing scheduleEngine.cascadeDelayFromTask). Auto-executes when the cascade does not push the project''s committed finish date; requires company-admin approval when it does.',
  ARRAY['task.delay_reported'], 'CODE', 'active'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 11. FEATURE FLAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  company_id uuid REFERENCES organizations(id),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Postgres treats NULL as distinct under a plain UNIQUE(key, company_id)
-- constraint, which would let repeated migration runs insert duplicate
-- global (company_id IS NULL) rows for the same key. Two partial unique
-- indexes close that: one for the global-default row per key, one for each
-- company's override per key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_feature_flags_global_key
  ON ai_feature_flags(key) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_feature_flags_company_key
  ON ai_feature_flags(key, company_id) WHERE company_id IS NOT NULL;

ALTER TABLE ai_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai feature flags"
  ON ai_feature_flags FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- Global defaults: every Phase 1 capability starts OFF platform-wide.
-- A company is opted in explicitly by inserting a company-scoped row with
-- enabled = true (service-role only) — see docs/ai-brain/CP360_AI_IMPLEMENTATION_PLAN.md.
INSERT INTO ai_feature_flags (key, company_id, enabled) VALUES
  ('ai_brain_enabled', NULL, false),
  ('ai_brain_audit', NULL, false),
  ('ai_brain_events', NULL, false),
  ('ai_brain_agent_registry', NULL, false),
  ('ai_brain_workflow_engine', NULL, false),
  ('ai_brain_controlled_tools', NULL, false),
  ('ai_brain_policy_engine', NULL, false)
ON CONFLICT (key) WHERE company_id IS NULL DO NOTHING;
