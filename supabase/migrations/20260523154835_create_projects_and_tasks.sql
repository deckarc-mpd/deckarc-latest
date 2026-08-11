/*
  # Create projects, project_users, and tasks tables

  1. New Tables
    - `projects` - All construction projects
    - `project_users` - Junction table for project team members
    - `tasks` - Project tasks and milestones

  2. Security
    - RLS with role-based access
*/

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  project_name text NOT NULL,
  client_name text NOT NULL DEFAULT '',
  client_email text DEFAULT '',
  address text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  zip text DEFAULT '',
  project_type text DEFAULT '',
  description text DEFAULT '',
  start_date date,
  expected_finish_date date,
  projected_finish_date date,
  actual_finish_date date,
  status text NOT NULL DEFAULT 'Planning',
  progress_percentage integer DEFAULT 0,
  alert_status text DEFAULT 'green',
  internal_notes text DEFAULT '',
  client_visible_notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all projects"
  ON projects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE TABLE IF NOT EXISTS project_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  role_on_project text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, user_id)
);

ALTER TABLE project_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all project users"
  ON project_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Admins can manage project users"
  ON project_users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can update project users"
  ON project_users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can delete project users"
  ON project_users FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- Add project member select policy
CREATE POLICY "Project members can view their projects"
  ON projects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_users
      WHERE project_users.project_id = projects.id
      AND project_users.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  category text DEFAULT 'Other',
  assigned_role text DEFAULT '',
  assigned_user_id uuid REFERENCES user_profiles(id),
  planned_start_date date,
  planned_finish_date date,
  actual_start_date date,
  actual_finish_date date,
  status text NOT NULL DEFAULT 'Not Started',
  progress_percentage integer DEFAULT 0,
  dependency_task_id uuid,
  delay_reason text DEFAULT '',
  delay_days integer DEFAULT 0,
  is_client_visible boolean DEFAULT false,
  internal_notes text DEFAULT '',
  client_visible_notes text DEFAULT '',
  alert_status text DEFAULT 'green',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view tasks"
  ON tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
    OR assigned_user_id = auth.uid()
    OR (
      is_client_visible = true
      AND EXISTS (
        SELECT 1 FROM project_users
        WHERE project_users.project_id = tasks.project_id
        AND project_users.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can insert tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins and GCs can update tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
    OR assigned_user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
    OR assigned_user_id = auth.uid()
  );

CREATE POLICY "Admins can delete tasks"
  ON tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE INDEX IF NOT EXISTS idx_projects_organization ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_users_project ON project_users(project_id);
CREATE INDEX IF NOT EXISTS idx_project_users_user ON project_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user ON tasks(assigned_user_id);
