/*
  # Priority 8b — CONVAZANT Org-Scope + Archive Requests Enhancements

  ## Summary
  Two hardening changes:

  ### 1. CONVAZANT org-scoping on projects UPDATE
  The existing "Admins can update projects" policy allows both DECKARC_ADMIN and
  CONVAZANT_SUPER_ADMIN to archive/delete ANY project. This is too broad.
  The fix: replace the single shared policy with two separate role-scoped policies.
  - DECKARC_ADMIN can update projects in their own organization only.
  - CONVAZANT_SUPER_ADMIN can update projects in their own organization only
    (org 0001, which has no operational projects — effectively read-only for DECKARC projects).

  This is enforced by matching projects.organization_id to the caller's organization_id
  from user_profiles, preventing cross-org mutations.

  ### 2. archive_requests — add project_name denorm column
  Allows admin panel to display project name without a join that could be blocked by
  RLS on projects (non-members can't read projects). Populated on insert from client.

  ## Security
  - CONVAZANT_SUPER_ADMIN cannot archive or delete DECKARC operational projects.
  - DECKARC_ADMIN can only mutate their own org's projects.
  - All other policies unchanged.
*/

-- ─── Drop the shared update policy ────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can update projects" ON projects;

-- ─── DECKARC_ADMIN: update only own-org projects ─────────────────────────────
CREATE POLICY "DECKARC admins can update own org projects"
  ON projects
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'DECKARC_ADMIN'
        AND user_profiles.organization_id = projects.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'DECKARC_ADMIN'
        AND user_profiles.organization_id = projects.organization_id
    )
  );

-- ─── CONVAZANT_SUPER_ADMIN: update only their own org's projects ──────────────
-- In practice their org (0001) has no operational projects, so this is view-only
-- for DECKARC workspaces. If CONVAZANT ever creates projects under their own org
-- they can manage those.
CREATE POLICY "CONVAZANT admins can update own org projects"
  ON projects
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        AND user_profiles.organization_id = projects.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'CONVAZANT_SUPER_ADMIN'
        AND user_profiles.organization_id = projects.organization_id
    )
  );

-- ─── archive_requests: add project_name denorm ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'archive_requests' AND column_name = 'project_name'
  ) THEN
    ALTER TABLE archive_requests ADD COLUMN project_name text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'archive_requests' AND column_name = 'requester_name'
  ) THEN
    ALTER TABLE archive_requests ADD COLUMN requester_name text NOT NULL DEFAULT '';
  END IF;
END $$;
