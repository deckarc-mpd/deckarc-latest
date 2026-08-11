/*
  # Create Project Delay Reasons Table

  ## Purpose
  Tracks all delay reasons on a project with role-based visibility controls.
  Connects to tasks, schedule change log, activity log, and client acknowledgement flow.

  ## New Tables
  - `project_delay_reasons` — full schema with role-based visibility

  ## Security
  - RLS enabled; Admin full CRUD, GC select/insert/update, Client select approved only, Subcontractor see own task delays
*/

CREATE TABLE IF NOT EXISTS project_delay_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  related_record_type text DEFAULT '',
  related_record_id uuid,
  delay_category text NOT NULL DEFAULT 'Other',
  internal_reason text DEFAULT '',
  client_safe_reason text DEFAULT '',
  estimated_delay_days integer NOT NULL DEFAULT 0,
  approved_delay_days integer NOT NULL DEFAULT 0,
  schedule_impact_possible boolean NOT NULL DEFAULT false,
  schedule_impact_status text NOT NULL DEFAULT 'No Impact',
  original_projected_completion date,
  revised_projected_completion date,
  owner_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  responsible_role text DEFAULT '',
  client_visible boolean NOT NULL DEFAULT false,
  client_visibility_status text NOT NULL DEFAULT 'Internal Only',
  client_response_required boolean NOT NULL DEFAULT false,
  client_response_status text NOT NULL DEFAULT 'Not Required',
  auto_acknowledgement_enabled boolean NOT NULL DEFAULT false,
  response_deadline timestamptz,
  status text NOT NULL DEFAULT 'Open',
  next_action text DEFAULT '',
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_delay_reasons_project_id ON project_delay_reasons(project_id);
CREATE INDEX IF NOT EXISTS idx_delay_reasons_status ON project_delay_reasons(status);
CREATE INDEX IF NOT EXISTS idx_delay_reasons_client_visible ON project_delay_reasons(client_visible, client_visibility_status);

ALTER TABLE project_delay_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select delay reasons in their org"
  ON project_delay_reasons FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can insert delay reasons"
  ON project_delay_reasons FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can update delay reasons"
  ON project_delay_reasons FOR UPDATE
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

CREATE POLICY "GC can select delay reasons for assigned projects"
  ON project_delay_reasons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'GENERAL_CONTRACTOR'
    )
    AND project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "GC can insert delay reasons"
  ON project_delay_reasons FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'GENERAL_CONTRACTOR'
    )
  );

CREATE POLICY "GC can update delay reasons"
  ON project_delay_reasons FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'GENERAL_CONTRACTOR'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'GENERAL_CONTRACTOR'
    )
  );

CREATE POLICY "Clients can select approved client-visible delay reasons"
  ON project_delay_reasons FOR SELECT
  TO authenticated
  USING (
    client_visible = true
    AND client_visibility_status = 'Visible to Client'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CLIENT'
    )
    AND project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Clients can update response status"
  ON project_delay_reasons FOR UPDATE
  TO authenticated
  USING (
    client_visible = true
    AND client_visibility_status = 'Visible to Client'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CLIENT'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CLIENT'
    )
  );

CREATE POLICY "Subcontractors can select delay reasons for their tasks"
  ON project_delay_reasons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'SUBCONTRACTOR'
    )
    AND task_id IN (
      SELECT id FROM tasks WHERE assigned_user_id = auth.uid()
    )
  );
