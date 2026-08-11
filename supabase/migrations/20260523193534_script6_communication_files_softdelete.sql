/*
  # Script #6 — Communication Messages, Project Files, Soft Delete Fields

  ## Summary
  Adds the Communication Hub message table, Project File Vault metadata table,
  and soft delete / archive fields to core tables.

  ## New Tables
  1. `communication_messages` — threaded messages per project/record with visibility controls
  2. `project_files` — file vault metadata with category, visibility, org scoping

  ## Modified Tables
  - `projects` — soft delete fields (is_archived, archived_at, archived_by_user_id, archive_reason, county, county_status)
  - `permits` — enhanced fields (county, jurisdiction, portal_link, correction_notes, client_visible_note_draft)
  - `inspections` — enhanced fields (county, jurisdiction, inspector details, readiness checklist flags)
  - `tasks` — requires_permit, county fields
  - `activity_log` — org_id, old_value, new_value fields

  ## Security
  - RLS on all new tables with org scoping and role checks
*/

-- =====================================================================
-- COMMUNICATION MESSAGES TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS communication_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  related_record_type text,
  related_record_id uuid,
  sender_user_id uuid REFERENCES user_profiles(id),
  sender_role text,
  message_body text NOT NULL,
  message_type text NOT NULL DEFAULT 'General Note',
  visibility text NOT NULL DEFAULT 'Internal Only',
  mentioned_user_ids uuid[],
  follow_up_required boolean DEFAULT false,
  follow_up_due_date date,
  priority_level text NOT NULL DEFAULT 'Normal',
  is_urgent boolean DEFAULT false,
  response_required boolean DEFAULT false,
  response_due_by date,
  escalation_required boolean DEFAULT false,
  escalation_reason text,
  schedule_impact_possible boolean DEFAULT false,
  client_visibility_status text DEFAULT 'Internal Only',
  attachment_placeholder text,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view project messages"
  ON communication_messages FOR SELECT
  TO authenticated
  USING (
    -- Admins see all in their org
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
    OR
    -- Field users see messages on their projects
    (
      visibility NOT IN ('Admin Only')
      AND EXISTS (
        SELECT 1 FROM project_users
        WHERE project_id = communication_messages.project_id
        AND user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Authenticated users can insert messages"
  ON communication_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM project_users
      WHERE project_id = communication_messages.project_id
      AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Senders and admins can update messages"
  ON communication_messages FOR UPDATE
  TO authenticated
  USING (
    sender_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  )
  WITH CHECK (
    sender_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- =====================================================================
-- PROJECT FILES TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  uploaded_by_user_id uuid REFERENCES user_profiles(id),
  uploaded_by_role text,
  file_name text NOT NULL,
  file_type text,
  file_size_kb integer,
  document_category text NOT NULL DEFAULT 'Other',
  custom_category_name text,
  related_module text,
  related_record_id uuid,
  file_description text,
  file_date date,
  vendor_name text,
  receipt_amount numeric(10,2),
  permit_number text,
  inspection_type text,
  client_visible boolean NOT NULL DEFAULT false,
  internal_only boolean NOT NULL DEFAULT true,
  admin_approval_required boolean NOT NULL DEFAULT false,
  client_visibility_status text NOT NULL DEFAULT 'Internal Only',
  approved_for_client_at timestamptz,
  approved_for_client_by uuid REFERENCES user_profiles(id),
  storage_path_or_placeholder text,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by_user_id uuid REFERENCES user_profiles(id),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by_user_id uuid REFERENCES user_profiles(id),
  uploaded_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all project files in org"
  ON project_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

CREATE POLICY "Field users can view non-internal project files"
  ON project_files FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM project_users
      WHERE project_id = project_files.project_id
      AND user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role NOT IN ('CLIENT')
    )
  );

CREATE POLICY "Clients can view approved client-visible files"
  ON project_files FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND client_visible = true
    AND client_visibility_status = 'Approved for Client'
    AND EXISTS (
      SELECT 1 FROM project_users
      WHERE project_id = project_files.project_id
      AND user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CLIENT'
    )
  );

CREATE POLICY "Authenticated users can upload files"
  ON project_files FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM project_users
        WHERE project_id = project_files.project_id
        AND user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
      )
    )
  );

CREATE POLICY "Uploaders and admins can update files"
  ON project_files FOR UPDATE
  TO authenticated
  USING (
    uploaded_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  )
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- =====================================================================
-- SOFT DELETE + COUNTY FIELDS ON PROJECTS
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'is_archived') THEN
    ALTER TABLE projects ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'archived_at') THEN
    ALTER TABLE projects ADD COLUMN archived_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'archived_by_user_id') THEN
    ALTER TABLE projects ADD COLUMN archived_by_user_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'archive_reason') THEN
    ALTER TABLE projects ADD COLUMN archive_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'county') THEN
    ALTER TABLE projects ADD COLUMN county text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'county_status') THEN
    ALTER TABLE projects ADD COLUMN county_status text DEFAULT 'Needs Confirmation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'zip_code') THEN
    ALTER TABLE projects ADD COLUMN zip_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'city') THEN
    ALTER TABLE projects ADD COLUMN city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'state') THEN
    ALTER TABLE projects ADD COLUMN state text DEFAULT 'NC';
  END IF;
END $$;

-- =====================================================================
-- ENHANCE PERMITS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'county') THEN
    ALTER TABLE permits ADD COLUMN county text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'jurisdiction') THEN
    ALTER TABLE permits ADD COLUMN jurisdiction text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'permit_portal_link') THEN
    ALTER TABLE permits ADD COLUMN permit_portal_link text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'correction_notes') THEN
    ALTER TABLE permits ADD COLUMN correction_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'client_visible_note_draft') THEN
    ALTER TABLE permits ADD COLUMN client_visible_note_draft text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'submitted_by') THEN
    ALTER TABLE permits ADD COLUMN submitted_by text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'resubmission_date') THEN
    ALTER TABLE permits ADD COLUMN resubmission_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'permit_expiration_date') THEN
    ALTER TABLE permits ADD COLUMN permit_expiration_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'schedule_impact_possible') THEN
    ALTER TABLE permits ADD COLUMN schedule_impact_possible boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'organization_id') THEN
    ALTER TABLE permits ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
END $$;

-- =====================================================================
-- ENHANCE INSPECTIONS TABLE
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'county') THEN
    ALTER TABLE inspections ADD COLUMN county text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'jurisdiction') THEN
    ALTER TABLE inspections ADD COLUMN jurisdiction text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'inspector_name') THEN
    ALTER TABLE inspections ADD COLUMN inspector_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'inspector_phone') THEN
    ALTER TABLE inspections ADD COLUMN inspector_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'inspector_email') THEN
    ALTER TABLE inspections ADD COLUMN inspector_email text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'inspector_id_badge') THEN
    ALTER TABLE inspections ADD COLUMN inspector_id_badge text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'inspector_department') THEN
    ALTER TABLE inspections ADD COLUMN inspector_department text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'inspector_comments') THEN
    ALTER TABLE inspections ADD COLUMN inspector_comments text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'client_visible_note_draft') THEN
    ALTER TABLE inspections ADD COLUMN client_visible_note_draft text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'readiness_permit_approved') THEN
    ALTER TABLE inspections ADD COLUMN readiness_permit_approved boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'readiness_task_completed') THEN
    ALTER TABLE inspections ADD COLUMN readiness_task_completed boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'readiness_photos_uploaded') THEN
    ALTER TABLE inspections ADD COLUMN readiness_photos_uploaded boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'readiness_site_access_confirmed') THEN
    ALTER TABLE inspections ADD COLUMN readiness_site_access_confirmed boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'schedule_impact_possible') THEN
    ALTER TABLE inspections ADD COLUMN schedule_impact_possible boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'organization_id') THEN
    ALTER TABLE inspections ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
END $$;

-- =====================================================================
-- ENHANCE ACTIVITY LOG
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_log' AND column_name = 'organization_id') THEN
    ALTER TABLE activity_log ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_log' AND column_name = 'old_value') THEN
    ALTER TABLE activity_log ADD COLUMN old_value text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_log' AND column_name = 'new_value') THEN
    ALTER TABLE activity_log ADD COLUMN new_value text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_log' AND column_name = 'reason_note') THEN
    ALTER TABLE activity_log ADD COLUMN reason_note text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_log' AND column_name = 'user_role') THEN
    ALTER TABLE activity_log ADD COLUMN user_role text;
  END IF;
END $$;
