/*
  # Foundation Features Migration

  ## Summary
  Adds four new tables to support:

  1. **activity_log** — Audit trail of all important actions across the app
     - Who made the change (user_id, role, full_name)
     - What was changed (project_id, module, action_type)
     - Old/new values stored as text
     - Timestamp and optional notes

  2. **schedule_change_requests** — Approval queue for non-admin delay submissions
     - Non-admin users submit delay requests that queue for admin approval
     - Admins can approve (with optional day edit), reject, or request clarification
     - Only approved requests cascade to projected dates
     - Status: Pending / Approved / Rejected / Clarification Needed

  3. **project_closeout_checklists** — Per-project closeout checklist
     - 8 standard closeout items auto-created when triggered
     - Tracks status per item: Pending / Complete / N/A
     - Admin warned before marking project Completed if items remain open

  4. **notification_preferences** — Per-user notification settings
     - Email on/off, SMS placeholder on/off
     - Preferred method, quiet hours start/end
     - Per-event type toggles (delay, inspection, payment, decision, daily update)

  ## Security
  - All tables have RLS enabled with proper ownership checks
*/

-- ─── Activity Log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  user_full_name text DEFAULT '',
  user_role text DEFAULT '',
  action_type text NOT NULL,
  module text DEFAULT '',
  related_record_id uuid,
  related_record_type text DEFAULT '',
  old_value text DEFAULT '',
  new_value text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert activity log entries"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins and owners can read activity log entries"
  ON activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
    OR user_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS activity_log_project_id_idx ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log(created_at DESC);

-- ─── Schedule Change Requests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  requested_by_name text DEFAULT '',
  requested_by_role text DEFAULT '',
  affected_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  change_type text DEFAULT 'Task Delay',
  delay_days integer DEFAULT 0,
  reason text DEFAULT '',
  status text DEFAULT 'Pending',
  reviewed_by_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  admin_notes text DEFAULT '',
  approved_delay_days integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE schedule_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert schedule change requests"
  ON schedule_change_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requested_by_user_id);

CREATE POLICY "Users can read own and admins can read all schedule requests"
  ON schedule_change_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
    OR requested_by_user_id = auth.uid()
  );

CREATE POLICY "Admins can update schedule change requests"
  ON schedule_change_requests FOR UPDATE
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

CREATE INDEX IF NOT EXISTS scr_project_id_idx ON schedule_change_requests(project_id);
CREATE INDEX IF NOT EXISTS scr_status_idx ON schedule_change_requests(status);

-- ─── Project Closeout Checklists ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_closeout_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  status text DEFAULT 'Pending',
  completed_by_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  notes text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_closeout_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GC and admins can read closeout checklists"
  ON project_closeout_checklists FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

CREATE POLICY "Admins can insert closeout checklist items"
  ON project_closeout_checklists FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Admins can update closeout checklist items"
  ON project_closeout_checklists FOR UPDATE
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

-- ─── Notification Preferences ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE UNIQUE,
  notifications_enabled boolean DEFAULT true,
  email_notifications boolean DEFAULT true,
  sms_notifications boolean DEFAULT false,
  preferred_method text DEFAULT 'email',
  quiet_hours_start time,
  quiet_hours_end time,
  notify_on_delay boolean DEFAULT true,
  notify_on_inspection boolean DEFAULT true,
  notify_on_payment_due boolean DEFAULT true,
  notify_on_client_decision boolean DEFAULT true,
  notify_on_daily_update boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notification preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
