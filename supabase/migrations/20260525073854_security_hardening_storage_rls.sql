/*
  # Security Hardening — Supabase Storage RLS for project-files bucket

  ## Summary
  Replaces the permissive "any authenticated user" storage policies with
  path-prefix-enforced, role-based policies.

  ## Path Format
  All files must be stored at: {org_id}/{project_id}/{timestamp}_{filename}
  The first path segment is org_id, the second is project_id.
  Policies extract these using storage.foldername(name)[1] and [2].

  ## New Policies

  ### INSERT
  Only allow upload if the user has verified access to the target project:
  - CONVAZANT_SUPER_ADMIN / DECKARC_ADMIN: any project (global admins)
  - GENERAL_CONTRACTOR / SUBCONTRACTOR: must be in project_users for that project
  - CLIENT: no upload allowed

  ### SELECT (for signed URL generation)
  Only allow creating signed URLs / reading objects if the user has access:
  - CONVAZANT_SUPER_ADMIN / DECKARC_ADMIN: any file in bucket
  - GENERAL_CONTRACTOR / SUBCONTRACTOR: only projects they are assigned to
  - CLIENT: only files where client_visible=true AND status='Approved for Client'
    AND they are in project_users for that project

  ### UPDATE / DELETE
  Kept as owner-only (no change needed).

  ## Notes
  - storage.foldername(name) returns an array: [segment1, segment2, ...]
  - Path format: org_id/project_id/timestamp_filename
  - segment[1] = org_id (index 1 in 1-based Postgres array)
  - segment[2] = project_id (index 2)
  - The project_id extracted from the path is cast to uuid for JOIN safety
*/

-- ============================================================
-- DROP existing permissive storage policies
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload project files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own project files" ON storage.objects;

-- ============================================================
-- Helper: extract project_id from storage path
-- Path format: {org_id}/{project_id}/filename
-- storage.foldername returns 1-based array of path segments
-- ============================================================

-- ============================================================
-- INSERT — restrict uploads to allowed project paths
-- ============================================================

-- Admins (CONVAZANT + DECKARC): can upload to any path in this bucket
CREATE POLICY "Admins can upload to any project path"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- GC and Subcontractor: can only upload into projects they are assigned to
CREATE POLICY "Project members can upload to assigned project paths"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('GENERAL_CONTRACTOR', 'SUBCONTRACTOR')
    )
    AND EXISTS (
      SELECT 1 FROM project_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.project_id = (storage.foldername(name))[2]::uuid
    )
  );

-- ============================================================
-- SELECT — restrict signed URL generation / object reads
-- ============================================================

-- Admins: can read/sign any file in this bucket
CREATE POLICY "Admins can read all project files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- GC and Subcontractor: can only read files from projects they are assigned to
CREATE POLICY "Project members can read assigned project files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('GENERAL_CONTRACTOR', 'SUBCONTRACTOR')
    )
    AND EXISTS (
      SELECT 1 FROM project_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.project_id = (storage.foldername(name))[2]::uuid
    )
  );

-- Client: can only read files that are explicitly approved for client visibility
-- and for projects they are assigned to
CREATE POLICY "Clients can read approved client-visible files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = 'CLIENT'
    )
    AND EXISTS (
      SELECT 1 FROM project_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.project_id = (storage.foldername(name))[2]::uuid
    )
    AND EXISTS (
      SELECT 1 FROM project_files pf
      WHERE pf.storage_path = (storage.foldername(name))[2] || '/' || (storage.filename(name))
             OR pf.storage_path = name
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM project_files pf
      WHERE pf.storage_path = name
        AND pf.client_visible = true
        AND pf.client_visibility_status = 'Approved for Client'
        AND pf.is_deleted = false
    )
  );

-- ============================================================
-- UPDATE — owner only (restored)
-- ============================================================
CREATE POLICY "Owners and admins can update storage objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
      )
    )
  )
  WITH CHECK (
    bucket_id = 'project-files'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
      )
    )
  );

-- ============================================================
-- DELETE — owner only (restored)
-- ============================================================
CREATE POLICY "Owners and admins can delete storage objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
      )
    )
  );
