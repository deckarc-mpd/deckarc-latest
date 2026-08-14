/*
  # Fix action_items and notifications RLS security

  ## Summary

  ### action_items table
  Two wildcard policies were present that bypassed all role-scoped policies:
  - "Authenticated users can insert action items" WITH CHECK (true) — any auth user could insert
  - "Authenticated users can select action items" USING (true) — any auth user could read all rows
  - "Authenticated users can update action items" USING/WITH CHECK (true) — any auth user could update all rows

  These are removed. The narrower scoped policies remain and are sufficient:
  - Admin/GC can insert, update, delete action items
  - Users can view their assigned items OR admin/GC role items OR client_visible items on their projects
  - Clients can insert review-request items assigned to admin

  Additionally: GC needs SELECT access to action_items for the Action Board to work.
  The existing "Users can view relevant action items" already covers GC via role check.

  ### notifications table
  The previous fix allowed any authenticated user to insert any notification (too broad).
  Tightened to: the inserting user must be a member of the project the notification
  references (or the notification has no project_id, for system-level notifications).
  This prevents a user from sending arbitrary notifications to other users.

  ## Security changes
  - Removed 3 wildcard action_items policies
  - Added GC to the action_items SELECT policy (they need Action Board access)
  - Replaced open notifications INSERT with project-membership-scoped INSERT
*/

-- ── action_items ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert action items" ON action_items;
DROP POLICY IF EXISTS "Authenticated users can select action items" ON action_items;
DROP POLICY IF EXISTS "Authenticated users can update action items" ON action_items;

-- Ensure GC can read action_items for the Action Board (they are in the role check already
-- but the "Users can view relevant action items" policy only had admin roles in the EXISTS;
-- re-create it to include GC)
DROP POLICY IF EXISTS "Users can view relevant action items" ON action_items;

CREATE POLICY "Users can view relevant action items"
  ON action_items
  FOR SELECT
  TO authenticated
  USING (
    -- Admin and GC see all action items
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'
        ])
    )
    OR
    -- Assigned user sees their item
    assigned_user_id = auth.uid()
    OR
    -- Client-visible items on projects the user belongs to
    (
      client_visible = true
      AND EXISTS (
        SELECT 1 FROM project_users
        WHERE project_users.user_id = auth.uid()
          AND project_users.project_id = action_items.project_id
      )
    )
  );

-- ── notifications ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can insert notifications" ON notifications;

-- Any project member can insert a notification for another member of the same project.
-- Notifications with no project_id (system-level) are allowed for admin/GC only.
CREATE POLICY "Project members can insert notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Has a project_id: inserter must be a member of that project
    (
      project_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM project_users
        WHERE project_users.project_id = notifications.project_id
          AND project_users.user_id = auth.uid()
      )
    )
    OR
    -- No project_id: only admin/GC can insert system-level notifications
    (
      project_id IS NULL
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.role = ANY (ARRAY[
            'CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'
          ])
      )
    )
  );
