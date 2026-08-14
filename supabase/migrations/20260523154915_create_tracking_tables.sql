/*
  # Create all tracking tables

  1. New Tables
    - daily_updates, permits, inspections, weather_risks
    - client_decisions, change_orders, payment_milestones
    - ai_reports, notifications

  2. Security - RLS on all tables with role-based policies
*/

CREATE TABLE IF NOT EXISTS daily_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id),
  user_id uuid REFERENCES user_profiles(id),
  update_date date NOT NULL DEFAULT CURRENT_DATE,
  work_completed_today text DEFAULT '',
  work_planned_tomorrow text DEFAULT '',
  current_status text DEFAULT '',
  blockers text DEFAULT '',
  delay_reason text DEFAULT '',
  delay_days integer DEFAULT 0,
  materials_delivered text DEFAULT '',
  materials_pending text DEFAULT '',
  permit_update text DEFAULT '',
  inspection_update text DEFAULT '',
  weather_issue text DEFAULT '',
  client_decision_needed text DEFAULT '',
  internal_note text DEFAULT '',
  client_visible_note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view daily updates"
  ON daily_updates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Team members can insert daily updates"
  ON daily_updates FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own daily updates"
  ON daily_updates FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE TABLE IF NOT EXISTS permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  permit_required boolean DEFAULT true,
  permit_type text DEFAULT '',
  submitted_date date,
  permit_number text DEFAULT '',
  permit_status text DEFAULT 'Not Started',
  approval_date date,
  responsible_user_id uuid REFERENCES user_profiles(id),
  notes text DEFAULT '',
  alert_status text DEFAULT 'yellow',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE permits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view permits"
  ON permits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins and GCs can insert permits"
  ON permits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins and GCs can update permits"
  ON permits FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE TABLE IF NOT EXISTS inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  inspection_type text DEFAULT 'Other',
  scheduled_date date,
  inspector_name text DEFAULT '',
  result text DEFAULT 'Not Scheduled',
  result_date date,
  notes text DEFAULT '',
  reinspection_date date,
  alert_status text DEFAULT 'yellow',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins and GCs can insert inspections"
  ON inspections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins and GCs can update inspections"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE TABLE IF NOT EXISTS weather_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  risk_date date NOT NULL DEFAULT CURRENT_DATE,
  risk_type text DEFAULT 'Other',
  risk_level text DEFAULT 'Low',
  impacted_task_id uuid REFERENCES tasks(id),
  notes text DEFAULT '',
  delay_days integer DEFAULT 0,
  alert_status text DEFAULT 'green',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE weather_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view weather risks"
  ON weather_risks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins and GCs can insert weather risks"
  ON weather_risks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins and GCs can update weather risks"
  ON weather_risks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE TABLE IF NOT EXISTS client_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  decision_title text NOT NULL,
  description text DEFAULT '',
  needed_by_date date,
  status text DEFAULT 'Needed',
  time_impact_days integer DEFAULT 0,
  cost_impact numeric(12,2) DEFAULT 0,
  client_visible_note text DEFAULT '',
  alert_status text DEFAULT 'yellow',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all client decisions"
  ON client_decisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
    OR EXISTS (
      SELECT 1 FROM project_users
      WHERE project_users.project_id = client_decisions.project_id
      AND project_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert client decisions"
  ON client_decisions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins and clients can update client decisions"
  ON client_decisions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR', 'CLIENT')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR', 'CLIENT')
    )
  );

CREATE TABLE IF NOT EXISTS change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  requested_by text DEFAULT '',
  description text DEFAULT '',
  cost_impact numeric(12,2) DEFAULT 0,
  time_impact_days integer DEFAULT 0,
  approval_status text DEFAULT 'Draft',
  approved_date date,
  internal_notes text DEFAULT '',
  client_visible_notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view change orders"
  ON change_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins can insert change orders"
  ON change_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins can update change orders"
  ON change_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE TABLE IF NOT EXISTS payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  milestone_name text NOT NULL,
  amount numeric(12,2) DEFAULT 0,
  due_date date,
  related_task_id uuid REFERENCES tasks(id),
  status text DEFAULT 'Not Due',
  paid_date date,
  notes text DEFAULT '',
  alert_status text DEFAULT 'green',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view payment milestones"
  ON payment_milestones FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can insert payment milestones"
  ON payment_milestones FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can update payment milestones"
  ON payment_milestones FOR UPDATE
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

CREATE TABLE IF NOT EXISTS ai_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  report_type text DEFAULT 'internal',
  report_text text DEFAULT '',
  created_by_user_id uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ai reports"
  ON ai_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
    OR (
      report_type = 'client'
      AND EXISTS (
        SELECT 1 FROM project_users
        WHERE project_users.project_id = ai_reports.project_id
        AND project_users.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins and GCs can insert ai reports"
  ON ai_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  notification_type text DEFAULT 'info',
  title text NOT NULL,
  message text DEFAULT '',
  status text DEFAULT 'unread',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_daily_updates_project ON daily_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_updates_user ON daily_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_permits_project ON permits(project_id);
CREATE INDEX IF NOT EXISTS idx_inspections_project ON inspections(project_id);
CREATE INDEX IF NOT EXISTS idx_weather_risks_project ON weather_risks(project_id);
CREATE INDEX IF NOT EXISTS idx_client_decisions_project ON client_decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_project ON change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_project ON payment_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
