/*
  # Allow Clients to Insert Review Request Communication Messages

  The existing INSERT policy on communication_messages requires the user to be
  in project_users (which the client is) and sets sender_user_id = auth.uid().
  That policy already covers CLIENT role — no additional policy is needed.

  However, to be explicit and ensure the policy is correctly scoped, we verify
  the existing policy covers this case. The existing policy is:
    "Authenticated users can insert messages"
    WITH CHECK: sender_user_id = auth.uid() AND EXISTS (project_users match)

  Since the client IS in project_users for their projects, inserts will succeed
  as long as sender_user_id is set to auth.uid() in the application code.

  This migration is intentionally a no-op — it documents that no additional
  policy is required for communication_messages inserts from the CLIENT role.
*/

-- No SQL changes needed — existing policy already allows CLIENT inserts
-- as long as sender_user_id = auth.uid() and project_id matches project_users.
SELECT 1;
