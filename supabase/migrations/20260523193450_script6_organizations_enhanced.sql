/*
  # Script #6 — Enhance Organizations + Add Consents, Invitations, Access Requests

  ## Summary
  Extends the existing organizations table with SaaS workspace fields.
  Adds user consent tracking, invite flow, access requests, and workspace requests.

  ## Changes to Existing Tables
  - `organizations`: adds status, workspace_status, plan, service_area, business_type, phone, website, updated_at

  ## New Tables
  1. `user_consents` — legal/AI consent acceptance per user per version
  2. `user_invitations` — admin-controlled invite flow
  3. `access_requests` — users requesting access to existing workspace
  4. `workspace_requests` — new companies requesting CP360 workspace

  ## Security
  - RLS enabled on all new tables
  - Consent records scoped to auth.uid()
  - Invitations/requests scoped to admin roles
*/

-- =====================================================================
-- ENHANCE ORGANIZATIONS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'status') THEN
    ALTER TABLE organizations ADD COLUMN status text NOT NULL DEFAULT 'Active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'workspace_status') THEN
    ALTER TABLE organizations ADD COLUMN workspace_status text NOT NULL DEFAULT 'Active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'plan') THEN
    ALTER TABLE organizations ADD COLUMN plan text DEFAULT 'Professional';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'service_area') THEN
    ALTER TABLE organizations ADD COLUMN service_area text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'business_type') THEN
    ALTER TABLE organizations ADD COLUMN business_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'phone') THEN
    ALTER TABLE organizations ADD COLUMN phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'website') THEN
    ALTER TABLE organizations ADD COLUMN website text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'organization_type') THEN
    ALTER TABLE organizations ADD COLUMN organization_type text DEFAULT 'Contractor Company';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'updated_at') THEN
    ALTER TABLE organizations ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Update existing organizations to have proper types
UPDATE organizations SET organization_type = 'Platform Owner' WHERE name = 'CONVAZANT INC' AND organization_type IS NULL;
UPDATE organizations SET organization_type = 'Contractor Company', plan = 'Professional' WHERE name = 'DECKARC LLC' AND organization_type IS NULL;

-- =====================================================================
-- USER CONSENTS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id),
  organization_id uuid REFERENCES organizations(id),
  role_at_acceptance text,
  consent_version text NOT NULL DEFAULT '1.0',
  terms_version text NOT NULL DEFAULT '1.0',
  privacy_version text NOT NULL DEFAULT '1.0',
  ai_consent_version text NOT NULL DEFAULT '1.0',
  electronic_records_consent_version text NOT NULL DEFAULT '1.0',
  accepted_terms boolean NOT NULL DEFAULT false,
  accepted_ai_consent boolean NOT NULL DEFAULT false,
  accepted_electronic_records boolean NOT NULL DEFAULT false,
  accepted_privacy_notice boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  declined_at timestamptz,
  ip_address_placeholder text,
  user_agent_placeholder text,
  consent_text_snapshot text,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consents"
  ON user_consents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consent"
  ON user_consents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own consent"
  ON user_consents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view org consents"
  ON user_consents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- =====================================================================
-- USER INVITATIONS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  invited_by_user_id uuid REFERENCES user_profiles(id),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  company_name text,
  role text NOT NULL,
  assigned_project_ids uuid[],
  invite_note text,
  status text NOT NULL DEFAULT 'Draft',
  expiration_date date,
  token text UNIQUE DEFAULT gen_random_uuid()::text,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view org invitations"
  ON user_invitations FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM user_profiles WHERE id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CONVAZANT_SUPER_ADMIN'
    )
  );

CREATE POLICY "Admins can insert invitations"
  ON user_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can update invitations"
  ON user_invitations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- =====================================================================
-- ACCESS REQUESTS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  company_name text,
  requested_role text NOT NULL,
  existing_workspace_name text,
  project_or_client_name text,
  reason text,
  message text,
  status text NOT NULL DEFAULT 'Pending',
  reviewed_by_user_id uuid REFERENCES user_profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit access request"
  ON access_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view access requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can update access requests"
  ON access_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- =====================================================================
-- WORKSPACE REQUESTS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS workspace_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  owner_full_name text NOT NULL,
  owner_email text NOT NULL,
  phone text,
  website text,
  business_type text,
  service_area text,
  active_project_count text,
  expected_user_count text,
  message text,
  status text NOT NULL DEFAULT 'Pending',
  reviewed_by_user_id uuid REFERENCES user_profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  created_organization_id uuid REFERENCES organizations(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workspace_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit workspace request"
  ON workspace_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Convazant admin can view workspace requests"
  ON workspace_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CONVAZANT_SUPER_ADMIN'
    )
  );

CREATE POLICY "Convazant admin can update workspace requests"
  ON workspace_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CONVAZANT_SUPER_ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CONVAZANT_SUPER_ADMIN'
    )
  );
