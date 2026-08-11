/*
  # Role-Based RLS for Permits & Inspections

  ## Summary
  Updates SELECT policies on permits and inspections tables to allow all five roles
  to read records, with visibility rules enforced in the application layer:

  - CONVAZANT_SUPER_ADMIN: full read (support/audit)
  - DECKARC_ADMIN: full read/write
  - GENERAL_CONTRACTOR: full read/write on permits & inspections
  - SUBCONTRACTOR: read-only (app layer further filters to assigned tasks)
  - CLIENT: read-only (app layer shows only client-approved content)

  INSERT/UPDATE remain restricted to DECKARC_ADMIN and GENERAL_CONTRACTOR.
  DELETE remains restricted to DECKARC_ADMIN only.

  ## Changes
  1. Drops old restrictive SELECT policies
  2. Adds new SELECT policies allowing all authenticated roles to read
  3. Adds DELETE policy for DECKARC_ADMIN
  4. Adds client_visible boolean columns to permits and inspections
     so admins can control what clients see
  5. Adds internal_notes columns for admin-only notes
*/

-- Add client_visible and internal_notes columns to permits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permits' AND column_name = 'client_visible'
  ) THEN
    ALTER TABLE permits ADD COLUMN client_visible boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permits' AND column_name = 'client_message'
  ) THEN
    ALTER TABLE permits ADD COLUMN client_message text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permits' AND column_name = 'internal_notes'
  ) THEN
    ALTER TABLE permits ADD COLUMN internal_notes text DEFAULT '';
  END IF;
END $$;

-- Add client_visible, internal_notes, inspector_contact columns to inspections
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'client_visible'
  ) THEN
    ALTER TABLE inspections ADD COLUMN client_visible boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'client_message'
  ) THEN
    ALTER TABLE inspections ADD COLUMN client_message text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'internal_notes'
  ) THEN
    ALTER TABLE inspections ADD COLUMN internal_notes text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'inspector_contact'
  ) THEN
    ALTER TABLE inspections ADD COLUMN inspector_contact text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'schedule_impact'
  ) THEN
    ALTER TABLE inspections ADD COLUMN schedule_impact text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permits' AND column_name = 'jurisdiction'
  ) THEN
    ALTER TABLE permits ADD COLUMN jurisdiction text DEFAULT '';
  END IF;
END $$;

-- Drop old SELECT policies
DROP POLICY IF EXISTS "Admins and GCs can view permits" ON permits;
DROP POLICY IF EXISTS "Admins and GCs can view inspections" ON inspections;

-- New SELECT: all authenticated roles can read
CREATE POLICY "All authenticated users can view permits"
  ON permits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_active = true
        AND user_profiles.role IN (
          'CONVAZANT_SUPER_ADMIN',
          'DECKARC_ADMIN',
          'GENERAL_CONTRACTOR',
          'SUBCONTRACTOR',
          'CLIENT'
        )
    )
  );

CREATE POLICY "All authenticated users can view inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_active = true
        AND user_profiles.role IN (
          'CONVAZANT_SUPER_ADMIN',
          'DECKARC_ADMIN',
          'GENERAL_CONTRACTOR',
          'SUBCONTRACTOR',
          'CLIENT'
        )
    )
  );

-- DELETE: DECKARC_ADMIN only
DROP POLICY IF EXISTS "Admins can delete permits" ON permits;
DROP POLICY IF EXISTS "Admins can delete inspections" ON inspections;

CREATE POLICY "Admins can delete permits"
  ON permits FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'DECKARC_ADMIN'
    )
  );

CREATE POLICY "Admins can delete inspections"
  ON inspections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'DECKARC_ADMIN'
    )
  );
