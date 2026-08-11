/*
  # Add lead_type, preferred_time, and source columns to cp360_leads

  1. Changes
    - `lead_type` (text, default 'founding_pilot_application') — differentiates Apply vs Walkthrough form submissions
    - `preferred_time` (text, default '') — collected on the walkthrough form
    - `source` (text, default 'founding-pilot') — tracks which page/surface the lead came from

  2. Notes
    - All columns are additive with safe defaults; no existing data is affected
    - lead_type values used by the app: 'founding_pilot_application' | 'walkthrough_request'
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cp360_leads' AND column_name = 'lead_type'
  ) THEN
    ALTER TABLE cp360_leads ADD COLUMN lead_type text NOT NULL DEFAULT 'founding_pilot_application';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cp360_leads' AND column_name = 'preferred_time'
  ) THEN
    ALTER TABLE cp360_leads ADD COLUMN preferred_time text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cp360_leads' AND column_name = 'source'
  ) THEN
    ALTER TABLE cp360_leads ADD COLUMN source text NOT NULL DEFAULT 'founding-pilot';
  END IF;
END $$;
