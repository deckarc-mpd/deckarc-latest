/*
# Create Customer Discovery module tables

Internal CP360 product-research module used by CONVAZANT Super Admins to
document contractor demos, capture structured feedback, track follow-ups,
and identify repeated product issues.

1. New Tables
  - `customer_discovery_sessions` — main record for one demo session
  - `customer_discovery_observations` — editable task-observation rows
  - `customer_discovery_feature_requests` — repeatable feature requests
  - `customer_discovery_activities` — activity log per session

2. Security
  - Enable RLS on all tables.
  - CONVAZANT_SUPER_ADMIN full CRUD; all other roles denied.
  - Uses a helper check against user_profiles.role = 'CONVAZANT_SUPER_ADMIN'.

3. Notes
  - Separate tables; no existing tables are touched.
  - Soft archive via archived_at on the main session table.
  - Status column: Draft | Completed | Archived.
*/

-- Helper function: is the current user a CONVAZANT Super Admin?
CREATE OR REPLACE FUNCTION is_convazant_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND role = 'CONVAZANT_SUPER_ADMIN'
      AND is_active = true
  );
$$;

-- ── Main session table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_discovery_sessions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                timestamptz DEFAULT now() NOT NULL,
  updated_at                timestamptz DEFAULT now() NOT NULL,
  archived_at               timestamptz,
  status                    text NOT NULL DEFAULT 'Draft', -- Draft | Completed | Archived

  -- A. Company Information
  company_name              text NOT NULL DEFAULT '',
  contact_name              text NOT NULL DEFAULT '',
  contact_role              text DEFAULT '',
  email                     text DEFAULT '',
  phone                     text DEFAULT '',
  company_size              text DEFAULT '',
  active_projects           integer DEFAULT 0,
  annual_revenue_range      text DEFAULT '',
  primary_service_type      text DEFAULT '',
  current_software          text[] DEFAULT '{}',   -- multi-select
  referral_source           text DEFAULT '',

  -- B. Demo Information
  demo_date                 date,
  presenter                 text DEFAULT '',
  demo_duration_minutes     integer DEFAULT 0,
  demo_type                 text DEFAULT '',
  product_version           text DEFAULT '',
  demo_environment          text DEFAULT '',
  demo_goals                text DEFAULT '',

  -- C. Live Observation (summary metrics stored; rows in child table)
  task_completion_rate      numeric DEFAULT 0,
  tasks_needing_help        integer DEFAULT 0,
  average_confusion_level   text DEFAULT '',

  -- D. Customer Feedback
  overall_rating            integer DEFAULT 0,        -- 1-5
  attention_clarity        text DEFAULT '',          -- Yes|Mostly|Somewhat|No
  valuable_feature          text DEFAULT '',
  main_frustration          text DEFAULT '',
  missing_information      text DEFAULT '',
  morning_usage_likelihood  text DEFAULT '',         -- Definitely|Probably|Maybe|Probably Not
  value_moment              text DEFAULT '',
  single_change             text DEFAULT '',
  recommendation_score     integer DEFAULT 0,        -- 0-10

  -- E. Commercial Interest
  estimated_time_saved     text DEFAULT '',
  expected_monthly_price   text DEFAULT '',
  preferred_plan           text DEFAULT '',
  purchase_readiness       text DEFAULT '',
  main_buying_concern      text DEFAULT '',
  beta_interest            text DEFAULT '',
  testimonial_permission   text DEFAULT '',

  -- F. Demo Outcome
  outcome                  text DEFAULT '',          -- Strong Interest|Interested|Needs Follow-up|Not a Fit
  outcome_reason           text DEFAULT '',
  top_positive_signal      text DEFAULT '',
  top_concern              text DEFAULT '',
  recommended_next_step    text DEFAULT '',

  -- G. Follow-up
  follow_up_required       boolean DEFAULT false,
  follow_up_date           date,
  follow_up_owner          text DEFAULT '',
  follow_up_type           text DEFAULT '',
  follow_up_notes          text DEFAULT '',
  follow_up_completed      boolean DEFAULT false,

  -- H. Internal Notes
  internal_summary         text DEFAULT '',
  what_we_learned          text DEFAULT '',
  product_changes          text DEFAULT '',
  sales_notes              text DEFAULT '',
  marketing_language       text DEFAULT '',

  -- AI Summary (mock)
  ai_summary               text DEFAULT '',

  -- Audit
  created_by               uuid
);

ALTER TABLE customer_discovery_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cd_select_convazant" ON customer_discovery_sessions;
CREATE POLICY "cd_select_convazant" ON customer_discovery_sessions
  FOR SELECT TO authenticated USING (is_convazant_super_admin());

DROP POLICY IF EXISTS "cd_insert_convazant" ON customer_discovery_sessions;
CREATE POLICY "cd_insert_convazant" ON customer_discovery_sessions
  FOR INSERT TO authenticated WITH CHECK (is_convazant_super_admin());

DROP POLICY IF EXISTS "cd_update_convazant" ON customer_discovery_sessions;
CREATE POLICY "cd_update_convazant" ON customer_discovery_sessions
  FOR UPDATE TO authenticated USING (is_convazant_super_admin()) WITH CHECK (is_convazant_super_admin());

DROP POLICY IF EXISTS "cd_delete_convazant" ON customer_discovery_sessions;
CREATE POLICY "cd_delete_convazant" ON customer_discovery_sessions
  FOR DELETE TO authenticated USING (is_convazant_super_admin());

-- ── Observation tasks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_discovery_observations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES customer_discovery_sessions(id) ON DELETE CASCADE,
  sort_order      integer NOT NULL DEFAULT 0,
  task_name       text NOT NULL DEFAULT '',
  completed       text DEFAULT 'No',     -- Yes | No | Partially
  needed_help     text DEFAULT 'No',      -- Yes | No
  time_taken      text DEFAULT '',
  confusion_level text DEFAULT 'None',   -- None | Low | Medium | High
  observer_notes  text DEFAULT '',
  created_at      timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE customer_discovery_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdo_select_convazant" ON customer_discovery_observations;
CREATE POLICY "cdo_select_convazant" ON customer_discovery_observations
  FOR SELECT TO authenticated USING (is_convazant_super_admin());

DROP POLICY IF EXISTS "cdo_insert_convazant" ON customer_discovery_observations;
CREATE POLICY "cdo_insert_convazant" ON customer_discovery_observations
  FOR INSERT TO authenticated WITH CHECK (is_convazant_super_admin());

DROP POLICY IF EXISTS "cdo_update_convazant" ON customer_discovery_observations;
CREATE POLICY "cdo_update_convazant" ON customer_discovery_observations
  FOR UPDATE TO authenticated USING (is_convazant_super_admin()) WITH CHECK (is_convazant_super_admin());

DROP POLICY IF EXISTS "cdo_delete_convazant" ON customer_discovery_observations;
CREATE POLICY "cdo_delete_convazant" ON customer_discovery_observations
  FOR DELETE TO authenticated USING (is_convazant_super_admin());

-- ── Feature requests ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_discovery_feature_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES customer_discovery_sessions(id) ON DELETE CASCADE,
  sort_order      integer NOT NULL DEFAULT 0,
  request_text    text NOT NULL DEFAULT '',
  underlying_problem text DEFAULT '',
  product_area    text DEFAULT '',
  importance      text DEFAULT '',       -- Critical | Important | Nice to Have
  frequency       text DEFAULT '',       -- Daily | Weekly | Occasionally | Rarely
  admin_notes     text DEFAULT '',
  created_at      timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE customer_discovery_feature_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdfr_select_convazant" ON customer_discovery_feature_requests;
CREATE POLICY "cdfr_select_convazant" ON customer_discovery_feature_requests
  FOR SELECT TO authenticated USING (is_convazant_super_admin());

DROP POLICY IF EXISTS "cdfr_insert_convazant" ON customer_discovery_feature_requests;
CREATE POLICY "cdfr_insert_convazant" ON customer_discovery_feature_requests
  FOR INSERT TO authenticated WITH CHECK (is_convazant_super_admin());

DROP POLICY IF EXISTS "cdfr_update_convazant" ON customer_discovery_feature_requests;
CREATE POLICY "cdfr_update_convazant" ON customer_discovery_feature_requests
  FOR UPDATE TO authenticated USING (is_convazant_super_admin()) WITH CHECK (is_convazant_super_admin());

DROP POLICY IF EXISTS "cdfr_delete_convazant" ON customer_discovery_feature_requests;
CREATE POLICY "cdfr_delete_convazant" ON customer_discovery_feature_requests
  FOR DELETE TO authenticated USING (is_convazant_super_admin());

-- ── Activity log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_discovery_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES customer_discovery_sessions(id) ON DELETE CASCADE,
  activity_type   text NOT NULL DEFAULT '',  -- created | edited | outcome_changed | follow_up_scheduled | follow_up_completed | archived
  description     text DEFAULT '',
  created_at      timestamptz DEFAULT now() NOT NULL,
  created_by      uuid
);

ALTER TABLE customer_discovery_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cda_select_convazant" ON customer_discovery_activities;
CREATE POLICY "cda_select_convazant" ON customer_discovery_activities
  FOR SELECT TO authenticated USING (is_convazant_super_admin());

DROP POLICY IF EXISTS "cda_insert_convazant" ON customer_discovery_activities;
CREATE POLICY "cda_insert_convazant" ON customer_discovery_activities
  FOR INSERT TO authenticated WITH CHECK (is_convazant_super_admin());

DROP POLICY IF EXISTS "cda_delete_convazant" ON customer_discovery_activities;
CREATE POLICY "cda_delete_convazant" ON customer_discovery_activities
  FOR DELETE TO authenticated USING (is_convazant_super_admin());

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cd_sessions_outcome ON customer_discovery_sessions(outcome);
CREATE INDEX IF NOT EXISTS idx_cd_sessions_demo_date ON customer_discovery_sessions(demo_date);
CREATE INDEX IF NOT EXISTS idx_cd_sessions_status ON customer_discovery_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cd_observations_session ON customer_discovery_observations(session_id);
CREATE INDEX IF NOT EXISTS idx_cd_feature_requests_session ON customer_discovery_feature_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_cd_activities_session ON customer_discovery_activities(session_id);

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cd_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cd_sessions_updated_at ON customer_discovery_sessions;
CREATE TRIGGER trg_cd_sessions_updated_at
  BEFORE UPDATE ON customer_discovery_sessions
  FOR EACH ROW EXECUTE FUNCTION cd_set_updated_at();
