/*
  # CP360 Advanced Modules Migration

  Adds all new tables and upgrades existing ones for:
  1. Task schedule fields (projected dates, delay source, schedule lock)
  2. Schedule Change Log
  3. Project Calendar Settings
  4. US National Holidays
  5. Materials Tracker
  6. Incidents Tracker
  7. RFI / Project Questions
  8. Photo Proof Log
  9. Punch List & Warranty
  10. Communication Timeline
  11. Phase Readiness Checklist
  12. Weekly Health Reports
  13. Crew Confirmations
  14. Upgraded notifications table
  15. Upgraded permits, inspections, payments, change orders
*/

-- ============================================================
-- 1. UPGRADE TASKS TABLE
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='projected_start_date') THEN
    ALTER TABLE tasks ADD COLUMN projected_start_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='projected_finish_date') THEN
    ALTER TABLE tasks ADD COLUMN projected_finish_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='delay_source') THEN
    ALTER TABLE tasks ADD COLUMN delay_source text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='schedule_locked') THEN
    ALTER TABLE tasks ADD COLUMN schedule_locked boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='weather_sensitive') THEN
    ALTER TABLE tasks ADD COLUMN weather_sensitive boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='weather_risk_type') THEN
    ALTER TABLE tasks ADD COLUMN weather_risk_type text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='blocked_reason') THEN
    ALTER TABLE tasks ADD COLUMN blocked_reason text DEFAULT '';
  END IF;
END $$;

-- ============================================================
-- 2. SCHEDULE CHANGE LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS schedule_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  affected_task_id uuid REFERENCES tasks(id),
  change_type text DEFAULT 'Manual Adjustment',
  old_start_date date,
  new_start_date date,
  old_finish_date date,
  new_finish_date date,
  old_projected_finish_date date,
  new_projected_finish_date date,
  reason text DEFAULT '',
  responsible_party text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE schedule_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view schedule change log"
  ON schedule_change_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins can insert schedule change log"
  ON schedule_change_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

-- ============================================================
-- 3. PROJECT CALENDAR SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS project_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  working_days_default text DEFAULT 'Mon-Fri',
  allow_saturday_work boolean DEFAULT false,
  allow_sunday_work boolean DEFAULT false,
  holiday_work_allowed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view project calendars"
  ON project_calendars FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins can insert project calendars"
  ON project_calendars FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

CREATE POLICY "Admins can update project calendars"
  ON project_calendars FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 4. US NATIONAL HOLIDAYS
-- ============================================================
CREATE TABLE IF NOT EXISTS us_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_name text NOT NULL,
  holiday_date date NOT NULL UNIQUE,
  year integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE us_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view holidays"
  ON us_holidays FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage holidays"
  ON us_holidays FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- Seed 2026 US Federal Holidays
INSERT INTO us_holidays (holiday_name, holiday_date, year) VALUES
  ('New Year''s Day', '2026-01-01', 2026),
  ('Martin Luther King Jr. Day', '2026-01-19', 2026),
  ('Presidents'' Day', '2026-02-16', 2026),
  ('Memorial Day', '2026-05-25', 2026),
  ('Juneteenth', '2026-06-19', 2026),
  ('Independence Day', '2026-07-04', 2026),
  ('Labor Day', '2026-09-07', 2026),
  ('Columbus Day', '2026-10-12', 2026),
  ('Veterans Day', '2026-11-11', 2026),
  ('Thanksgiving Day', '2026-11-26', 2026),
  ('Christmas Day', '2026-12-25', 2026),
  ('New Year''s Day', '2027-01-01', 2027),
  ('Martin Luther King Jr. Day', '2027-01-18', 2027),
  ('Presidents'' Day', '2027-02-15', 2027),
  ('Memorial Day', '2027-05-31', 2027),
  ('Juneteenth', '2027-06-19', 2027),
  ('Independence Day', '2027-07-05', 2027),
  ('Labor Day', '2027-09-06', 2027),
  ('Columbus Day', '2027-10-11', 2027),
  ('Veterans Day', '2027-11-11', 2027),
  ('Thanksgiving Day', '2027-11-25', 2027),
  ('Christmas Day', '2027-12-25', 2027)
ON CONFLICT (holiday_date) DO NOTHING;

-- ============================================================
-- 5. MATERIALS TRACKER
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  related_task_id uuid REFERENCES tasks(id),
  material_name text NOT NULL,
  material_category text DEFAULT 'Other',
  quantity_required numeric(10,2) DEFAULT 0,
  quantity_ordered numeric(10,2) DEFAULT 0,
  quantity_delivered numeric(10,2) DEFAULT 0,
  unit text DEFAULT '',
  supplier_name text DEFAULT '',
  supplier_contact text DEFAULT '',
  order_status text DEFAULT 'Not Ordered',
  ordered_date date,
  expected_delivery_date date,
  actual_delivery_date date,
  delivery_location text DEFAULT '',
  material_ready_status text DEFAULT 'Not Ready',
  lead_time_days integer DEFAULT 0,
  responsible_party text DEFAULT '',
  notes text DEFAULT '',
  alert_status text DEFAULT 'yellow',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view materials"
  ON materials FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR','SUBCONTRACTOR')));

CREATE POLICY "Admins and GCs can insert materials"
  ON materials FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins and GCs can update materials"
  ON materials FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins can delete materials"
  ON materials FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 6. INCIDENTS TRACKER
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  related_task_id uuid REFERENCES tasks(id),
  related_material_id uuid REFERENCES materials(id),
  incident_title text NOT NULL,
  incident_type text DEFAULT 'Other',
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  reported_by text DEFAULT '',
  responsible_party text DEFAULT '',
  affected_party text DEFAULT '',
  incident_description text DEFAULT '',
  location_on_site text DEFAULT '',
  severity_level text DEFAULT 'Medium',
  delay_expected boolean DEFAULT false,
  estimated_delay_days integer DEFAULT 0,
  actual_delay_days integer DEFAULT 0,
  cost_impact_expected boolean DEFAULT false,
  estimated_cost_impact numeric(12,2) DEFAULT 0,
  replacement_required boolean DEFAULT false,
  reorder_required boolean DEFAULT false,
  repair_required boolean DEFAULT false,
  insurance_claim_needed boolean DEFAULT false,
  client_notification_needed boolean DEFAULT false,
  admin_approval_required boolean DEFAULT true,
  incident_status text DEFAULT 'Reported',
  resolution_plan text DEFAULT '',
  resolution_due_date date,
  resolved_date date,
  notes text DEFAULT '',
  alert_status text DEFAULT 'red',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view incidents"
  ON incidents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR','SUBCONTRACTOR')));

CREATE POLICY "Team can insert incidents"
  ON incidents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR','SUBCONTRACTOR')));

CREATE POLICY "Admins and GCs can update incidents"
  ON incidents FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins can delete incidents"
  ON incidents FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 7. RFI / PROJECT QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS rfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  related_task_id uuid REFERENCES tasks(id),
  question_title text NOT NULL,
  question_description text DEFAULT '',
  asked_by text DEFAULT '',
  assigned_to text DEFAULT '',
  due_date date,
  answer text DEFAULT '',
  status text DEFAULT 'Open',
  delay_expected boolean DEFAULT false,
  estimated_delay_days integer DEFAULT 0,
  notes text DEFAULT '',
  alert_status text DEFAULT 'yellow',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view rfis"
  ON rfis FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR','SUBCONTRACTOR')));

CREATE POLICY "Team can insert rfis"
  ON rfis FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR','SUBCONTRACTOR')));

CREATE POLICY "Admins and GCs can update rfis"
  ON rfis FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins can delete rfis"
  ON rfis FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 8. PHOTO PROOF LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS photo_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  related_task_id uuid REFERENCES tasks(id),
  uploaded_by uuid REFERENCES user_profiles(id),
  photo_category text DEFAULT 'Progress Photo',
  photo_description text DEFAULT '',
  photo_url text DEFAULT '',
  taken_date date DEFAULT CURRENT_DATE,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photo_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view photo logs"
  ON photo_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR','SUBCONTRACTOR')));

CREATE POLICY "Team can insert photo logs"
  ON photo_logs FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Admins can update photo logs"
  ON photo_logs FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')))
  WITH CHECK (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

CREATE POLICY "Admins can delete photo logs"
  ON photo_logs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 9. PUNCH LIST & WARRANTY
-- ============================================================
CREATE TABLE IF NOT EXISTS punch_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  item_type text DEFAULT 'Punch List',
  item_title text NOT NULL,
  description text DEFAULT '',
  reported_by text DEFAULT '',
  responsible_party text DEFAULT '',
  due_date date,
  status text DEFAULT 'Open',
  completion_date date,
  client_signoff_required boolean DEFAULT false,
  client_signoff_status text DEFAULT 'Not Required',
  notes text DEFAULT '',
  alert_status text DEFAULT 'yellow',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE punch_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view punch list"
  ON punch_list_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR','SUBCONTRACTOR')));

CREATE POLICY "Team can insert punch list"
  ON punch_list_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins and GCs can update punch list"
  ON punch_list_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins can delete punch list"
  ON punch_list_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 10. COMMUNICATION TIMELINE
-- ============================================================
CREATE TABLE IF NOT EXISTS communication_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  related_task_id uuid REFERENCES tasks(id),
  communication_type text DEFAULT 'General Note',
  date_time timestamptz DEFAULT now(),
  sender text DEFAULT '',
  recipient text DEFAULT '',
  message_summary text DEFAULT '',
  delivery_method text DEFAULT 'In-App',
  follow_up_required boolean DEFAULT false,
  follow_up_due_date date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view communication log"
  ON communication_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins and GCs can insert communication log"
  ON communication_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins can update communication log"
  ON communication_log FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 11. PHASE READINESS CHECKLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS phase_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  phase_name text NOT NULL,
  checklist_item text NOT NULL,
  status text DEFAULT 'Not Started',
  responsible_party text DEFAULT '',
  due_date date,
  notes text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE phase_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view phase checklists"
  ON phase_checklists FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins and GCs can insert phase checklists"
  ON phase_checklists FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins and GCs can update phase checklists"
  ON phase_checklists FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins can delete phase checklists"
  ON phase_checklists FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 12. WEEKLY HEALTH REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_health_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_week_start date NOT NULL,
  report_week_end date NOT NULL,
  generated_by uuid REFERENCES user_profiles(id),
  report_summary text DEFAULT '',
  high_risk_projects text DEFAULT '',
  recommended_actions text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE weekly_health_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view weekly reports"
  ON weekly_health_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

CREATE POLICY "Admins can insert weekly reports"
  ON weekly_health_reports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

CREATE POLICY "Admins can update weekly reports"
  ON weekly_health_reports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 13. CREW CONFIRMATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS crew_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id),
  subcontractor_user_id uuid REFERENCES user_profiles(id),
  scheduled_date date NOT NULL,
  confirmation_status text DEFAULT 'Pending',
  crew_available boolean DEFAULT true,
  start_time_confirmed boolean DEFAULT false,
  scope_understood boolean DEFAULT false,
  material_reviewed boolean DEFAULT false,
  site_access_confirmed boolean DEFAULT false,
  questions_before_arrival text DEFAULT '',
  confirmation_notes text DEFAULT '',
  confirmed_at timestamptz,
  alert_status text DEFAULT 'yellow',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE crew_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and GCs can view crew confirmations"
  ON crew_confirmations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR'))
    OR subcontractor_user_id = auth.uid());

CREATE POLICY "Admins can insert crew confirmations"
  ON crew_confirmations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins and assigned subs can update crew confirmations"
  ON crew_confirmations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR'))
    OR subcontractor_user_id = auth.uid())
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR'))
    OR subcontractor_user_id = auth.uid());

CREATE POLICY "Admins can delete crew confirmations"
  ON crew_confirmations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- 14. UPGRADE PERMITS TABLE
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permits' AND column_name='expected_approval_date') THEN
    ALTER TABLE permits ADD COLUMN expected_approval_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permits' AND column_name='actual_approval_date') THEN
    ALTER TABLE permits ADD COLUMN actual_approval_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permits' AND column_name='revision_requested') THEN
    ALTER TABLE permits ADD COLUMN revision_requested boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permits' AND column_name='revision_notes') THEN
    ALTER TABLE permits ADD COLUMN revision_notes text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permits' AND column_name='resubmitted_date') THEN
    ALTER TABLE permits ADD COLUMN resubmitted_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permits' AND column_name='permit_delay_expected') THEN
    ALTER TABLE permits ADD COLUMN permit_delay_expected boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permits' AND column_name='delay_reason') THEN
    ALTER TABLE permits ADD COLUMN delay_reason text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permits' AND column_name='affected_task_ids') THEN
    ALTER TABLE permits ADD COLUMN affected_task_ids text DEFAULT '';
  END IF;
END $$;

-- ============================================================
-- 15. UPGRADE INSPECTIONS TABLE
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='related_task_id') THEN
    ALTER TABLE inspections ADD COLUMN related_task_id uuid REFERENCES tasks(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='permit_number') THEN
    ALTER TABLE inspections ADD COLUMN permit_number text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='jurisdiction') THEN
    ALTER TABLE inspections ADD COLUMN jurisdiction text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='requested_date') THEN
    ALTER TABLE inspections ADD COLUMN requested_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='correction_required') THEN
    ALTER TABLE inspections ADD COLUMN correction_required boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='correction_notes') THEN
    ALTER TABLE inspections ADD COLUMN correction_notes text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='reinspection_required') THEN
    ALTER TABLE inspections ADD COLUMN reinspection_required boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='reinspection_requested_date') THEN
    ALTER TABLE inspections ADD COLUMN reinspection_requested_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='reinspection_scheduled_date') THEN
    ALTER TABLE inspections ADD COLUMN reinspection_scheduled_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='passed_date') THEN
    ALTER TABLE inspections ADD COLUMN passed_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='delay_reason') THEN
    ALTER TABLE inspections ADD COLUMN delay_reason text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='responsible_party') THEN
    ALTER TABLE inspections ADD COLUMN responsible_party text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inspections' AND column_name='inspection_status') THEN
    ALTER TABLE inspections ADD COLUMN inspection_status text DEFAULT 'Not Scheduled';
  END IF;
END $$;

-- ============================================================
-- 16. UPGRADE PAYMENT MILESTONES TABLE
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_milestones' AND column_name='payment_delay_expected') THEN
    ALTER TABLE payment_milestones ADD COLUMN payment_delay_expected boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_milestones' AND column_name='work_hold_required') THEN
    ALTER TABLE payment_milestones ADD COLUMN work_hold_required boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_milestones' AND column_name='days_overdue') THEN
    ALTER TABLE payment_milestones ADD COLUMN days_overdue integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_milestones' AND column_name='responsible_party') THEN
    ALTER TABLE payment_milestones ADD COLUMN responsible_party text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_milestones' AND column_name='affected_task_ids') THEN
    ALTER TABLE payment_milestones ADD COLUMN affected_task_ids text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_milestones' AND column_name='invoice_sent_date') THEN
    ALTER TABLE payment_milestones ADD COLUMN invoice_sent_date date;
  END IF;
END $$;

-- ============================================================
-- 17. UPGRADE CHANGE ORDERS TABLE
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='change_orders' AND column_name='change_order_number') THEN
    ALTER TABLE change_orders ADD COLUMN change_order_number text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='change_orders' AND column_name='affected_task_id') THEN
    ALTER TABLE change_orders ADD COLUMN affected_task_id uuid REFERENCES tasks(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='change_orders' AND column_name='schedule_update_required') THEN
    ALTER TABLE change_orders ADD COLUMN schedule_update_required boolean DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 18. ACTION ITEMS (Today's Action Board)
-- ============================================================
CREATE TABLE IF NOT EXISTS action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_title text NOT NULL,
  action_description text DEFAULT '',
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  related_task_id uuid REFERENCES tasks(id),
  assigned_role text DEFAULT '',
  assigned_user_id uuid REFERENCES user_profiles(id),
  visible_to_roles text DEFAULT 'CONVAZANT_SUPER_ADMIN,DECKARC_ADMIN',
  priority text DEFAULT 'Medium',
  due_date date,
  status text DEFAULT 'Open',
  client_visible boolean DEFAULT false,
  admin_approval_required boolean DEFAULT false,
  ai_recommended_next_step text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant action items"
  ON action_items FOR SELECT TO authenticated
  USING (
    assigned_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')
    )
    OR (
      client_visible = true
      AND EXISTS (
        SELECT 1 FROM project_users
        WHERE project_users.user_id = auth.uid()
        AND project_users.project_id = action_items.project_id
      )
    )
  );

CREATE POLICY "Admins can insert action items"
  ON action_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR')));

CREATE POLICY "Admins can update action items"
  ON action_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR'))
    OR assigned_user_id = auth.uid())
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN','GENERAL_CONTRACTOR'))
    OR assigned_user_id = auth.uid());

CREATE POLICY "Admins can delete action items"
  ON action_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN')));

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_schedule_change_log_project ON schedule_change_log(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_task ON materials(related_task_id);
CREATE INDEX IF NOT EXISTS idx_incidents_project ON incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id);
CREATE INDEX IF NOT EXISTS idx_photo_logs_project ON photo_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_punch_list_project ON punch_list_items(project_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_project ON communication_log(project_id);
CREATE INDEX IF NOT EXISTS idx_phase_checklists_project ON phase_checklists(project_id);
CREATE INDEX IF NOT EXISTS idx_crew_confirmations_project ON crew_confirmations(project_id);
CREATE INDEX IF NOT EXISTS idx_action_items_project ON action_items(project_id);
CREATE INDEX IF NOT EXISTS idx_action_items_user ON action_items(assigned_user_id);
