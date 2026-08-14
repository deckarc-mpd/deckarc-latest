/*
  # Add admin reply tracking to project_delay_reasons

  ## Summary
  Adds two columns to support the full admin-reply → client-acknowledge loop:

  1. `admin_reply` (text) — the admin's written response to the client's review request,
     stored directly on the delay record so the client can read it without navigating
     to the Communication Hub.

  2. `admin_replied_at` (timestamptz) — timestamp of when the admin posted the reply,
     used to surface the reply in chronological order on the client dashboard.

  ## New client_response_status values supported (no schema change needed, text column):
  - 'Admin Responded'        — admin has replied, awaiting client acknowledgement
  - 'Acknowledged by Client' — already exists, client has confirmed they saw the reply

  ## Security
  No new tables; existing RLS on project_delay_reasons covers these columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_delay_reasons' AND column_name = 'admin_reply'
  ) THEN
    ALTER TABLE project_delay_reasons ADD COLUMN admin_reply text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_delay_reasons' AND column_name = 'admin_replied_at'
  ) THEN
    ALTER TABLE project_delay_reasons ADD COLUMN admin_replied_at timestamptz DEFAULT NULL;
  END IF;
END $$;
