/*
  # Client Decisions — Response Fields and RLS Fix

  ## Purpose
  1. Add proper client response fields to client_decisions so the client's
     submitted response is stored separately from the admin's client_visible_note.
     Previously the code overwrote client_visible_note with the client's text,
     destroying the original admin note.

  2. Fix the UPDATE policy for CLIENT role — the existing policy allows any
     authenticated CLIENT to update any client_decisions row regardless of
     project membership. This tightens it to only allow updates on decisions
     for projects where the client is a member via project_users.

  ## New Columns
  - `client_response` (text) — the client's free-text response/selection
  - `client_responded_at` (timestamptz) — when the client submitted their response
  - `client_responded_by` (uuid) — auth.uid() of the responding client

  ## Security Changes
  - DROP the overly-broad CLIENT UPDATE policy
  - ADD a new scoped UPDATE policy: client can only update decisions for
    projects where they are a project_users member
*/

-- ─── Add client response columns ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_decisions' AND column_name = 'client_response'
  ) THEN
    ALTER TABLE client_decisions ADD COLUMN client_response text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_decisions' AND column_name = 'client_responded_at'
  ) THEN
    ALTER TABLE client_decisions ADD COLUMN client_responded_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_decisions' AND column_name = 'client_responded_by'
  ) THEN
    ALTER TABLE client_decisions ADD COLUMN client_responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Fix UPDATE RLS: drop old broad policy, add project-scoped one ──────────
DROP POLICY IF EXISTS "Admins and clients can update client decisions" ON client_decisions;

-- Admin/GC update policy (unchanged scope — admins can update any)
CREATE POLICY "Admins and GCs can update client decisions"
  ON client_decisions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

-- Client update policy: only for decisions on their assigned projects
CREATE POLICY "Clients can respond to decisions on their projects"
  ON client_decisions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'CLIENT'
    )
    AND EXISTS (
      SELECT 1 FROM project_users
      WHERE project_users.project_id = client_decisions.project_id
      AND project_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'CLIENT'
    )
    AND EXISTS (
      SELECT 1 FROM project_users
      WHERE project_users.project_id = client_decisions.project_id
      AND project_users.user_id = auth.uid()
    )
  );
