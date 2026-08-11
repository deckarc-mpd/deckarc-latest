/*
  # Fix project organization_id + add permits_applicability

  ## Changes

  ### 1. Data fix — New Bathroom Remodel organization_id
  "New Bathroom Remodel" (id: 5450e502) was seeded with organization_id
  '00000000-0000-0000-0000-000000000001' (CONVAZANT INC) instead of
  '00000000-0000-0000-0000-000000000002' (DECKARC LLC).
  The RLS UPDATE policy blocks the DECKARC Admin from editing any project
  not in their own org, so saves were silently rejected.
  This reassigns the project to the correct DECKARC org.

  ### 2. New column — projects.permits_applicability
  Reversible three-value setting per project:
    'Applicable'       — permits/inspections are required for this project
    'Not Applicable'   — permits/inspections are not required
    'To Be Confirmed'  — status is still being determined (default)
  Default is 'To Be Confirmed' so existing projects are unaffected until
  an admin explicitly sets the value.

  ### Notes
  - No RLS changes required; this column is updated via the existing
    DECKARC admin UPDATE policy on projects.
  - No tasks are deleted by this migration.
  - The column is nullable-safe with a text default.
*/

-- 1. Fix misassigned project org
UPDATE projects
SET organization_id = '00000000-0000-0000-0000-000000000002'
WHERE id = '5450e502-ca43-4143-86bd-a10b30dbd61d'
  AND organization_id = '00000000-0000-0000-0000-000000000001';

-- 2. Add permits_applicability column (safe if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'permits_applicability'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN permits_applicability text NOT NULL DEFAULT 'To Be Confirmed'
      CHECK (permits_applicability IN ('Applicable', 'Not Applicable', 'To Be Confirmed'));
  END IF;
END $$;
