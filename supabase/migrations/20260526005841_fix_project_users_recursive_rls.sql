/*
  # Fix infinite recursion in project_users RLS

  ## Problem
  The "Project members can read their project roster" SELECT policy on project_users
  contained a self-referential subquery:

    USING (EXISTS (SELECT 1 FROM project_users self WHERE self.project_id = ...))

  When Postgres evaluates this policy it queries project_users, which re-triggers
  the same policy, causing infinite recursion and a 500 error for all non-admin users.

  ## Fix
  1. Drop the recursive policy.
  2. Create a SECURITY DEFINER function `is_project_member(project_id uuid)` that
     checks membership without going through RLS (it runs as the function owner, not
     the calling user, so no policy is applied to its internal query).
  3. Rebuild the SELECT policy to call that function instead of the self-join.

  Also extend the INSERT policy to allow GC to add members to their own projects
  (needed so saveProject can insert project_users after creating a project).
*/

-- 1. Drop the recursive policy
DROP POLICY IF EXISTS "Project members can read their project roster" ON project_users;

-- 2. Drop and recreate the INSERT policy to also cover GC
DROP POLICY IF EXISTS "Admins can manage project users" ON project_users;

-- 3. Create a SECURITY DEFINER helper — runs as owner, bypasses RLS
CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_users
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  );
$$;

-- 4. Rebuild the SELECT policy using the safe helper
CREATE POLICY "Project members can read their project roster"
  ON project_users
  FOR SELECT
  TO authenticated
  USING (is_project_member(project_id));

-- 5. Recreate INSERT: admin can always insert; GC can insert on their own projects
CREATE POLICY "Admins and GCs can manage project users"
  ON project_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'
        ])
    )
  );
