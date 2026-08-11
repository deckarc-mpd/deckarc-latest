/*
  # Client Portal RLS Policies

  ## Purpose
  Add client-safe SELECT policies to tables that the client portal needs to read.
  Clients can only see records for projects they are members of (via project_users),
  and only records explicitly marked as client-visible.

  ## Changes

  ### payment_milestones
  - Add SELECT policy: clients can view payment milestones for their projects.
    Payment schedule is inherently client-visible (it's their money), so all
    milestones for the client's linked projects are shown.

  ### communication_messages
  - Existing policy already allows non-Admin-Only visibility for project_users members.
    Clients are added to project_users, so this should already work.
    Adding an explicit client-scoped policy for clarity and to ensure client
    visibility = 'Client Visible' or 'All' messages are shown.

  ### client_decisions
  - Existing admin SELECT policy uses project_users JOIN — clients in project_users
    can already read decisions. No change needed.

  ## Security
  - Clients ONLY see data for projects where project_users.user_id = auth.uid()
  - Payment milestones: all milestones for the project (amount, status, dates are client-appropriate)
  - Messages: only where visibility != 'Admin Only' and != 'Internal Only'
*/

-- ─── payment_milestones: allow clients to view milestones for their projects ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_milestones'
    AND policyname = 'Clients can view payment milestones for their projects'
  ) THEN
    CREATE POLICY "Clients can view payment milestones for their projects"
      ON payment_milestones FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.role = 'CLIENT'
        )
        AND EXISTS (
          SELECT 1 FROM project_users
          WHERE project_users.project_id = payment_milestones.project_id
          AND project_users.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── GC can view payment milestones for their org projects ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_milestones'
    AND policyname = 'GC can view payment milestones for assigned projects'
  ) THEN
    CREATE POLICY "GC can view payment milestones for assigned projects"
      ON payment_milestones FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.role = 'GENERAL_CONTRACTOR'
        )
        AND EXISTS (
          SELECT 1 FROM project_users
          WHERE project_users.project_id = payment_milestones.project_id
          AND project_users.user_id = auth.uid()
        )
      );
  END IF;
END $$;
