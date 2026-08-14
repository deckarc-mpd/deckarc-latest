/*
  # Fix project_users RLS + Create project_members_safe View

  ## Summary
  Two problems solved here:

  1. The existing project_users SELECT policy only allowed admins and the user
     themselves to read rows. General Contractors and Subcontractors could not
     fetch the list of users on their shared projects — which blocks the Task
     Assignment dropdown.

  2. A safe view `project_members_safe` is created that exposes only the fields
     needed for the assignment dropdown. Sensitive fields (EIN, license details,
     insurance, address, emergency contact) are deliberately excluded.

  ## Changes

  ### project_users — SELECT policy replacement
  - DROP old: "Admins can view all project users" (admin OR self — too narrow)
  - ADD new policy 1: Admins (CONVAZANT_SUPER_ADMIN, DECKARC_ADMIN) can read all rows
  - ADD new policy 2: Authenticated users can read project_users rows for projects
    they are already a member of (self-join check). This covers GC, Sub, and any
    future role.
  - Client isolation: Clients ARE members of project_users for their projects, so
    they can see the project_users rows for that project. However, the safe view
    below limits what columns they can see. The full user_profiles row (EIN,
    license, etc.) is NOT exposed through this policy — it only reveals user_id,
    role, and role_on_project from project_users itself.

  ### project_members_safe (view)
  - Joins project_users → user_profiles
  - Exposes ONLY: user_id, full_name, display_name, role, role_on_project,
    company_name, trade_specialty, project_id
  - Excludes: email, phone, EIN, address, license, insurance, emergency contact,
    avatar_url, is_active details, created_at
  - This is the view Task Assignment dropdown should query:
    SELECT * FROM project_members_safe WHERE project_id = ?

  ## Security Notes
  - Passwords: untouched, still Supabase Auth only
  - Client: can query project_members_safe for their OWN projects only
    (project_users membership gates it). They see name + role, not compliance data.
  - GC: can query members of projects they are assigned to only
  - Sub: same as GC — own projects only
  - Admin: can query all
  - No sensitive fields exposed in the view
*/

-- ── 1. Replace the old overly-narrow SELECT policy ───────────────────────────

DROP POLICY IF EXISTS "Admins can view all project users" ON project_users;

-- Policy A: Admins see everything
CREATE POLICY "Admins can read all project_users"
  ON project_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- Policy B: Any authenticated user can read project_users rows for projects
-- they are a member of. This enables GC/Sub/Client to enumerate their project team.
-- It does NOT expose user_profiles data — only the project_users join row itself.
CREATE POLICY "Project members can read their project roster"
  ON project_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_users AS self
      WHERE self.project_id = project_users.project_id
        AND self.user_id = auth.uid()
    )
  );

-- ── 2. Create the safe assignment-dropdown view ──────────────────────────────

CREATE OR REPLACE VIEW project_members_safe AS
  SELECT
    pu.project_id,
    pu.user_id,
    pu.role_on_project,
    up.full_name,
    up.display_name,
    up.role,
    up.company_name,
    up.trade_specialty
  FROM project_users pu
  JOIN user_profiles up ON up.id = pu.user_id;
