/*
  # Client Review Request RLS Policies

  Allows CLIENT role to insert into action_items, communication_log, and
  activity_log when submitting a schedule update review request.

  Without these policies the CLIENT inserts were silently blocked, meaning
  Action Board items, Communication Hub threads, and Activity Log entries
  were never created.

  Policies are intentionally narrow:
  - action_items: CLIENT can only insert rows assigned to DECKARC_ADMIN
  - communication_log: CLIENT can only insert rows of type 'Client Review Request'
  - activity_log: already has a broad authenticated INSERT policy (verified above),
    so no change needed there
*/

-- action_items: allow CLIENT to create review request items directed at DECKARC_ADMIN
CREATE POLICY "Clients can insert review request action items"
  ON action_items FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_role = 'DECKARC_ADMIN'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'CLIENT'
    )
  );

-- communication_log: allow CLIENT to insert review request threads
CREATE POLICY "Clients can insert review request communication log"
  ON communication_log FOR INSERT
  TO authenticated
  WITH CHECK (
    communication_type = 'Client Review Request'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'CLIENT'
    )
  );
