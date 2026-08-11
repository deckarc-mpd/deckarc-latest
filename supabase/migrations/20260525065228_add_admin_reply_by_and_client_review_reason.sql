/*
  # Add admin_replied_by and client_review_reason to project_delay_reasons

  1. Changes
    - `admin_replied_by` (uuid) — references auth.users, nullable. Tracks which admin authored the reply.
    - `client_review_reason` (text) — stores the client's stated reason when requesting a review.
      (Column may already exist from a prior migration; added safely with IF NOT EXISTS guard.)

  2. Notes
    - admin_reply and admin_replied_at already exist from migration 20260525035933.
    - This completes the admin-reply audit trail with the replying user's identity.
    - No RLS changes needed — existing policies on project_delay_reasons cover admin updates.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_delay_reasons' AND column_name = 'admin_replied_by'
  ) THEN
    ALTER TABLE project_delay_reasons
      ADD COLUMN admin_replied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_delay_reasons' AND column_name = 'client_review_reason'
  ) THEN
    ALTER TABLE project_delay_reasons
      ADD COLUMN client_review_reason text DEFAULT '';
  END IF;
END $$;
