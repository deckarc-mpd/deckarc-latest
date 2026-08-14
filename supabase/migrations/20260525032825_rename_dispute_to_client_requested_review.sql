/*
  # Rename Dispute Status to Client Requested Review

  Changes:
  1. Add client_review_reason column to store the client's explanation
  2. Update any existing "Disputed / Needs Review" status values to "Client Requested Review"
  3. Add auto_acknowledgement_paused column to track when auto-ack is suspended

  No destructive changes — only additive column additions and data updates.
*/

-- Add client review reason column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_delay_reasons' AND column_name = 'client_review_reason'
  ) THEN
    ALTER TABLE project_delay_reasons ADD COLUMN client_review_reason text;
  END IF;
END $$;

-- Add auto_acknowledgement_paused flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_delay_reasons' AND column_name = 'auto_acknowledgement_paused'
  ) THEN
    ALTER TABLE project_delay_reasons ADD COLUMN auto_acknowledgement_paused boolean DEFAULT false;
  END IF;
END $$;

-- Rename existing disputed status values
UPDATE project_delay_reasons
SET client_response_status = 'Client Requested Review'
WHERE client_response_status = 'Disputed / Needs Review';

UPDATE project_delay_reasons
SET status = 'Needs Admin Review'
WHERE status = 'Waiting on Admin';
