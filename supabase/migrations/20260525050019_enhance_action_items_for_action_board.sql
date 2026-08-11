/*
  # Enhance action_items table for Action Board v2

  ## Summary
  Adds columns to action_items to support the enhanced Action Board:
  - Quick resolve with timestamp + who resolved it
  - Snooze until a future date
  - Internal notes field
  - Source tracking (which module/record triggered this item)
  - updated_at timestamp

  ## New Columns
  - `notes` (text) — internal notes added from the board
  - `snoozed_until` (date) — if set, hide item until this date
  - `resolved_at` (timestamptz) — when the item was marked resolved/done
  - `resolved_by_user_id` (uuid) — who resolved it
  - `source_type` (text) — e.g. 'task', 'permit', 'inspection', 'manual'
  - `source_id` (text) — the id of the source record
  - `updated_at` (timestamptz) — last updated timestamp
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_items' AND column_name = 'notes') THEN
    ALTER TABLE action_items ADD COLUMN notes text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_items' AND column_name = 'snoozed_until') THEN
    ALTER TABLE action_items ADD COLUMN snoozed_until date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_items' AND column_name = 'resolved_at') THEN
    ALTER TABLE action_items ADD COLUMN resolved_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_items' AND column_name = 'resolved_by_user_id') THEN
    ALTER TABLE action_items ADD COLUMN resolved_by_user_id uuid REFERENCES user_profiles(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_items' AND column_name = 'source_type') THEN
    ALTER TABLE action_items ADD COLUMN source_type text DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_items' AND column_name = 'source_id') THEN
    ALTER TABLE action_items ADD COLUMN source_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_items' AND column_name = 'updated_at') THEN
    ALTER TABLE action_items ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- RLS: ensure authenticated users can insert/update action_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Authenticated users can insert action items'
  ) THEN
    CREATE POLICY "Authenticated users can insert action items"
      ON action_items FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Authenticated users can update action items'
  ) THEN
    CREATE POLICY "Authenticated users can update action items"
      ON action_items FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Authenticated users can select action items'
  ) THEN
    CREATE POLICY "Authenticated users can select action items"
      ON action_items FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
