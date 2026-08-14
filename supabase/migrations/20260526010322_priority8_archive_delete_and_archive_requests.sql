/*
  # Priority 8 — Project Archive and Soft Delete

  ## Summary
  Adds soft-delete fields to projects, an archive_requests table for GC-initiated
  archive requests, and hardens RLS to ensure only admins can archive/delete.

  ## Schema Changes
  ### projects table
  - `is_deleted` boolean DEFAULT false — soft delete flag
  - `deleted_at` timestamptz — when it was deleted
  - `deleted_by_user_id` uuid — who deleted it

  ### New table: archive_requests
  - GCs submit archive requests here; admins approve/deny
  - Columns: id, project_id, requested_by_user_id, requested_by_role,
    reason, status (pending/approved/denied), reviewed_by_user_id,
    reviewed_at, admin_note, created_at

  ## RLS Changes
  - projects SELECT: non-admin project members only see non-deleted projects
  - projects UPDATE: only DECKARC_ADMIN / CONVAZANT_SUPER_ADMIN (already correct, confirmed)
  - archive_requests: GC can INSERT own requests; Admin can SELECT/UPDATE all

  ## Security
  - Client/Sub/GC cannot set is_archived or is_deleted directly (UPDATE policy is admin-only)
  - Only admins can approve archive requests
*/

-- ─── Soft-delete columns on projects ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='is_deleted') THEN
    ALTER TABLE projects ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='deleted_at') THEN
    ALTER TABLE projects ADD COLUMN deleted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='deleted_by_user_id') THEN
    ALTER TABLE projects ADD COLUMN deleted_by_user_id uuid REFERENCES user_profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='delete_reason') THEN
    ALTER TABLE projects ADD COLUMN delete_reason text;
  END IF;
END $$;

-- ─── archive_requests table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS archive_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id),
  requested_by_user_id  uuid NOT NULL REFERENCES user_profiles(id),
  requested_by_role     text NOT NULL DEFAULT '',
  reason                text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'pending',
  reviewed_by_user_id   uuid REFERENCES user_profiles(id),
  reviewed_at           timestamptz,
  admin_note            text,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE archive_requests ENABLE ROW LEVEL SECURITY;

-- GC can insert requests for projects they are members of
CREATE POLICY "GC can submit archive requests"
  ON archive_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role = 'GENERAL_CONTRACTOR'
    )
    AND is_project_member(project_id)
  );

-- GC can see their own requests
CREATE POLICY "Users can view own archive requests"
  ON archive_requests
  FOR SELECT
  TO authenticated
  USING (
    requested_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role = ANY(ARRAY['CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN'])
    )
  );

-- Admin can update (approve/deny) requests
CREATE POLICY "Admins can update archive requests"
  ON archive_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role = ANY(ARRAY['CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role = ANY(ARRAY['CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN'])
    )
  );

-- ─── Harden projects SELECT: non-admin members don't see deleted projects ────
-- Drop and recreate the member SELECT policy to exclude deleted rows
DROP POLICY IF EXISTS "Project members can view their projects" ON projects;

CREATE POLICY "Project members can view their projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM project_users
      WHERE project_users.project_id = projects.id
        AND project_users.user_id = auth.uid()
    )
  );

-- Admins can see everything (including deleted) for their org
DROP POLICY IF EXISTS "Admins can view all projects" ON projects;

CREATE POLICY "Admins can view all projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY(ARRAY['CONVAZANT_SUPER_ADMIN','DECKARC_ADMIN'])
    )
  );

-- ─── Notify GC when archive request is approved: index for perf ─────────────
CREATE INDEX IF NOT EXISTS idx_archive_requests_project ON archive_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_archive_requests_user ON archive_requests(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_is_deleted ON projects(is_deleted);
CREATE INDEX IF NOT EXISTS idx_projects_is_archived ON projects(is_archived);
