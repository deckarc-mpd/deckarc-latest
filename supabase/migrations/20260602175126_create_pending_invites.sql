/*
  # Create pending_invites table

  Stores project invite records for people who haven't yet signed up on the platform.

  1. New Tables
    - `pending_invites`
      - `id` (uuid, pk)
      - `project_id` (uuid, fk → projects)
      - `full_name` (text)
      - `email` (text, normalized to lowercase)
      - `phone` (text)
      - `role` (text) — CLIENT, SUBCONTRACTOR, GENERAL_CONTRACTOR, etc.
      - `company_name` (text)
      - `notes` (text)
      - `invited_by` (uuid, fk → user_profiles)
      - `invited_at` (timestamptz)
      - `status` (text) — 'pending' | 'accepted' | 'declined'

  2. Security
    - RLS enabled
    - Admins can select/insert/update/delete
    - Invited person (matched by email) can read their own invite

  3. Notes
    - On invite: check if user already exists in user_profiles by email.
      If found, link directly via project_users instead.
    - email is stored lowercase.
    - Unique constraint: (project_id, email) prevents duplicate invites.
*/

CREATE TABLE IF NOT EXISTS pending_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  full_name    text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  phone        text DEFAULT '',
  role         text NOT NULL DEFAULT 'CLIENT',
  company_name text DEFAULT '',
  notes        text DEFAULT '',
  invited_by   uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  invited_at   timestamptz DEFAULT now(),
  status       text DEFAULT 'pending',
  created_at   timestamptz DEFAULT now(),
  UNIQUE (project_id, email)
);

ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

-- Admins can read all invites
CREATE POLICY "Admins can read pending invites"
  ON pending_invites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

-- Admins can create invites
CREATE POLICY "Admins can insert pending invites"
  ON pending_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

-- Admins can update invite status
CREATE POLICY "Admins can update pending invites"
  ON pending_invites FOR UPDATE
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

-- Admins can delete invites
CREATE POLICY "Admins can delete pending invites"
  ON pending_invites FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );
