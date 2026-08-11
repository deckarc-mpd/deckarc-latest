/*
  # Create alert_reads table

  Tracks when a user has acknowledged/read a generated alert.

  ## New Tables
  - `alert_reads`
    - `alert_id` (text) — the deterministic ID generated client-side (e.g. "task-uuid", "permit-uuid")
    - `user_id` (uuid) — the user who marked it read, references auth.users
    - `read_at` (timestamptz) — when it was marked read

  ## Security
  - RLS enabled; users can only read/write their own rows
*/

CREATE TABLE IF NOT EXISTS alert_reads (
  alert_id  text        NOT NULL,
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, user_id)
);

ALTER TABLE alert_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own alert reads"
  ON alert_reads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alert reads"
  ON alert_reads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own alert reads"
  ON alert_reads FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
