/*
  # Fix tasks RLS — Sub and Client insert, select, update

  ## Summary
  Three gaps in the tasks table RLS blocked the entire Sub/Client request flow:

  1. INSERT: Sub and Client could not insert tasks at all. Their "Submit Request"
     button silently failed at the DB level. Fixed by adding a scoped INSERT policy
     that allows Sub and Client to insert tasks only on projects they are members of,
     and only with status = 'Needs Review'.

  2. SELECT: The existing policy used assigned_user_id and is_client_visible but had
     no clause for created_by_user_id. Sub/Client who submitted a task could not see
     it in their own task list even though the frontend query was correct. Fixed by
     adding created_by_user_id = auth.uid() to the SELECT condition.

  3. UPDATE: Sub could update tasks assigned to them but not tasks they created.
     Fixed by adding created_by_user_id = auth.uid() to the UPDATE condition so
     Sub can update their own submitted requests (e.g. add notes, mark in progress).

  ## Security notes
  - Sub INSERT is restricted to: project membership + status = 'Needs Review'
  - Client INSERT is restricted to: project membership + status = 'Needs Review'
  - Neither Sub nor Client can insert with any other status
  - SELECT: both roles only see rows they created or were assigned to or are client-visible
  - UPDATE: scoped to their own submitted or assigned tasks only
*/

-- 1. Drop old overly-narrow INSERT policy
DROP POLICY IF EXISTS "Admins can insert tasks" ON tasks;

-- Recreate INSERT covering Admin, GC, Sub, Client
-- Sub and Client are limited to Needs Review status; enforced by WITH CHECK
CREATE POLICY "Authorised roles can insert tasks"
  ON tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Admin and GC can insert any task
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'
        ])
    )
    OR
    -- Sub can insert on their projects, status must be Needs Review
    (
      status = 'Needs Review'
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.role = 'SUBCONTRACTOR'
      )
      AND EXISTS (
        SELECT 1 FROM project_users
        WHERE project_users.project_id = tasks.project_id
          AND project_users.user_id = auth.uid()
      )
    )
    OR
    -- Client can insert on their projects, status must be Needs Review
    (
      status = 'Needs Review'
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.role = 'CLIENT'
      )
      AND EXISTS (
        SELECT 1 FROM project_users
        WHERE project_users.project_id = tasks.project_id
          AND project_users.user_id = auth.uid()
      )
    )
  );

-- 2. Drop old SELECT policy and add created_by_user_id clause
DROP POLICY IF EXISTS "Admins and GCs can view tasks" ON tasks;

CREATE POLICY "Authorised roles can view tasks"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (
    -- Admin and GC see all tasks
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'
        ])
    )
    OR
    -- Assigned user sees their own assigned tasks
    assigned_user_id = auth.uid()
    OR
    -- Creator sees tasks they submitted (covers Sub/Client Needs Review requests)
    created_by_user_id = auth.uid()
    OR
    -- Client-visible tasks for project members
    (
      is_client_visible = true
      AND EXISTS (
        SELECT 1 FROM project_users
        WHERE project_users.project_id = tasks.project_id
          AND project_users.user_id = auth.uid()
      )
    )
  );

-- 3. Drop old UPDATE policy and add created_by_user_id clause
DROP POLICY IF EXISTS "Admins and GCs can update tasks" ON tasks;

CREATE POLICY "Authorised roles can update tasks"
  ON tasks
  FOR UPDATE
  TO authenticated
  USING (
    -- Admin and GC can update any task
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'
        ])
    )
    OR
    -- Assigned user can update their task (status progression)
    assigned_user_id = auth.uid()
    OR
    -- Creator can update their own submitted request
    created_by_user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'
        ])
    )
    OR assigned_user_id = auth.uid()
    OR created_by_user_id = auth.uid()
  );
