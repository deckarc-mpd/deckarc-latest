/*
  # Fix Delay Reasons Admin SELECT Policy for NULL organization_id

  ## Problem
  The existing "Admins can select delay reasons in their org" policy uses:
    organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
  
  When both the delay record and user profile have NULL organization_id,
  NULL IN (NULL) evaluates to NULL (not TRUE), so admins see zero records.

  ## Fix
  Replace the policy to allow admins to see all delay reasons where either:
  - Their org matches the record's org, OR
  - Both are NULL (DECKARC_ADMIN with no org assigned)
*/

DROP POLICY IF EXISTS "Admins can select delay reasons in their org" ON project_delay_reasons;

CREATE POLICY "Admins can select delay reasons in their org"
  ON project_delay_reasons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
    AND (
      organization_id IN (
        SELECT user_profiles.organization_id FROM user_profiles WHERE user_profiles.id = auth.uid()
      )
      OR organization_id IS NULL
      OR (SELECT user_profiles.organization_id FROM user_profiles WHERE user_profiles.id = auth.uid()) IS NULL
    )
  );
