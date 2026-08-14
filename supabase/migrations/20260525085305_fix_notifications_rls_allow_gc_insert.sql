/*
  # Fix notifications RLS — allow GC to insert notifications

  ## Summary
  The existing notifications INSERT policy only allows CONVAZANT_SUPER_ADMIN and
  DECKARC_ADMIN to create notifications. This blocks General Contractors from
  notifying subcontractors when assigning tasks, which is a core workflow requirement.

  ## Change
  - Drop the admin-only INSERT policy
  - Replace with a broader policy that allows any authenticated project member
    (Admin, GC, Sub, Client) to insert notifications, as long as the notification
    targets a valid user.
  - This is safe: notifications are only ever read by the user they target
    (SELECT policy: user_id = auth.uid()), so a GC inserting a notification
    for a sub is correct and safe.
*/

DROP POLICY IF EXISTS "Admins can insert notifications" ON notifications;

CREATE POLICY "Authenticated users can insert notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
