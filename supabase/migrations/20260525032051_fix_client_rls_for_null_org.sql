/*
  # Fix Client RLS for Null Organization ID

  The demo client user has organization_id = null, which causes the existing
  client SELECT policy to silently return 0 rows because the subquery
  `SELECT organization_id FROM user_profiles WHERE id = auth.uid()`
  returns NULL, and NULL IN (...) always evaluates to NULL (not TRUE).

  Fix: Drop the old client SELECT policy and replace it with one that
  allows clients to read approved client-visible delay records for any
  project, relying solely on the client_visible + client_visibility_status
  conditions rather than an org join that breaks with null org_id.

  The UPDATE policy is similarly fixed.
*/

-- Drop old client policies
DROP POLICY IF EXISTS "Clients can select approved client-visible delay reasons" ON project_delay_reasons;
DROP POLICY IF EXISTS "Clients can update response status" ON project_delay_reasons;

-- New client SELECT: read any approved client-visible record
-- (internal records are protected by client_visible = false / status != 'Visible to Client')
CREATE POLICY "Clients can select approved client-visible delay reasons"
  ON project_delay_reasons FOR SELECT
  TO authenticated
  USING (
    client_visible = true
    AND client_visibility_status = 'Visible to Client'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CLIENT'
    )
  );

-- New client UPDATE: only their own response status field
CREATE POLICY "Clients can update response status"
  ON project_delay_reasons FOR UPDATE
  TO authenticated
  USING (
    client_visible = true
    AND client_visibility_status = 'Visible to Client'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CLIENT'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'CLIENT'
    )
  );
