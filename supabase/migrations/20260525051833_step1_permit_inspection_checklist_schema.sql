/*
  # Step 1 — Permit + Inspection Checklist Flow: Schema Enhancements

  ## Summary
  Extends permits, inspections, and projects tables and creates the new
  project_inspection_requirements table to support permit holder profiles,
  jurisdiction auto-inheritance, inspection checklist tracker, and attention flags.

  ## Changes

  ### 1. projects table
  - Added county, jurisdiction, permit_authority

  ### 2. permits table
  - Added permit holder / contractor fields
  - Added jurisdiction/location fields auto-filled from project

  ### 3. inspections table
  - Added permit_id (FK), inspection_requirement_id (FK), attention_flag,
    sequence_warning, override_reason

  ### 4. project_inspection_requirements (NEW)
  - Full checklist per project with ordering, readiness, attention logic, RLS
*/

-- ─── projects: add location fields ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'county') THEN
    ALTER TABLE projects ADD COLUMN county text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'jurisdiction') THEN
    ALTER TABLE projects ADD COLUMN jurisdiction text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'permit_authority') THEN
    ALTER TABLE projects ADD COLUMN permit_authority text DEFAULT '';
  END IF;
END $$;

-- ─── permits: add permit holder / jurisdiction fields ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'permit_pulled_by_name') THEN
    ALTER TABLE permits ADD COLUMN permit_pulled_by_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'permit_holder_company') THEN
    ALTER TABLE permits ADD COLUMN permit_holder_company text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'permit_holder_contact_phone') THEN
    ALTER TABLE permits ADD COLUMN permit_holder_contact_phone text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'permit_holder_contact_email') THEN
    ALTER TABLE permits ADD COLUMN permit_holder_contact_email text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'license_number') THEN
    ALTER TABLE permits ADD COLUMN license_number text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'license_valid_until') THEN
    ALTER TABLE permits ADD COLUMN license_valid_until date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'permit_pull_date') THEN
    ALTER TABLE permits ADD COLUMN permit_pull_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'inspection_responsibility') THEN
    ALTER TABLE permits ADD COLUMN inspection_responsibility text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'county') THEN
    ALTER TABLE permits ADD COLUMN county text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'city') THEN
    ALTER TABLE permits ADD COLUMN city text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'jurisdiction') THEN
    ALTER TABLE permits ADD COLUMN jurisdiction text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permits' AND column_name = 'permit_authority') THEN
    ALTER TABLE permits ADD COLUMN permit_authority text DEFAULT '';
  END IF;
END $$;

-- ─── inspections: add FK + attention fields ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'permit_id') THEN
    ALTER TABLE inspections ADD COLUMN permit_id uuid REFERENCES permits(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'inspection_requirement_id') THEN
    ALTER TABLE inspections ADD COLUMN inspection_requirement_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'attention_flag') THEN
    ALTER TABLE inspections ADD COLUMN attention_flag boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'sequence_warning') THEN
    ALTER TABLE inspections ADD COLUMN sequence_warning boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inspections' AND column_name = 'override_reason') THEN
    ALTER TABLE inspections ADD COLUMN override_reason text DEFAULT '';
  END IF;
END $$;

-- ─── project_inspection_requirements: new table ──────────────────────────────
CREATE TABLE IF NOT EXISTS project_inspection_requirements (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid REFERENCES organizations(id) ON DELETE CASCADE,
  project_id                uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  permit_id                 uuid REFERENCES permits(id) ON DELETE SET NULL,
  inspection_type           text NOT NULL DEFAULT 'Other',
  custom_inspection_name    text DEFAULT '',
  custom_inspection_reason  text DEFAULT '',
  is_custom                 boolean DEFAULT false,
  inspection_order          integer NOT NULL DEFAULT 0,
  required                  boolean DEFAULT true,
  optional                  boolean DEFAULT false,
  prerequisite_inspection_id uuid REFERENCES project_inspection_requirements(id) ON DELETE SET NULL,
  related_phase             text DEFAULT '',
  related_task_id           uuid,
  status                    text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Scheduled', 'Passed', 'Failed', 'Correction Required', 'Waived', 'Not Required')),
  readiness_status          text NOT NULL DEFAULT 'Not Ready'
    CHECK (readiness_status IN ('Not Ready', 'Ready', 'Needs Attention', 'Blocked')),
  attention_flag            boolean DEFAULT false,
  attention_reasons         text[] DEFAULT '{}',
  client_visible            boolean DEFAULT true,
  client_message            text DEFAULT '',
  notes                     text DEFAULT '',
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

ALTER TABLE project_inspection_requirements ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user in the same org can view
CREATE POLICY "Org members can view inspection requirements"
  ON project_inspection_requirements FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
    OR
    organization_id IS NULL
  );

-- INSERT: admin and GC roles only
CREATE POLICY "Admins and GCs can insert inspection requirements"
  ON project_inspection_requirements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

-- UPDATE: admin and GC roles only
CREATE POLICY "Admins and GCs can update inspection requirements"
  ON project_inspection_requirements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

-- DELETE: admin only
CREATE POLICY "Admins can delete inspection requirements"
  ON project_inspection_requirements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN')
    )
  );

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_inspection_requirements_project_id
  ON project_inspection_requirements(project_id);

CREATE INDEX IF NOT EXISTS idx_inspection_requirements_order
  ON project_inspection_requirements(project_id, inspection_order);

CREATE INDEX IF NOT EXISTS idx_inspections_permit_id
  ON inspections(permit_id);
