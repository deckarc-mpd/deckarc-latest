/*
  # Create cp360_leads table

  1. New Tables
    - `cp360_leads`
      - `id` (uuid, primary key)
      - `created_at` (timestamptz)
      - `full_name` (text, required)
      - `company_name` (text)
      - `email` (text, required)
      - `phone` (text)
      - `website` (text)
      - `city_state` (text)
      - `contractor_type` (text)
      - `active_projects` (text) — range label e.g. "3–5"
      - `biggest_challenge` (text)
      - `pilot_project_notes` (text)
      - `status` (text, default 'new') — admin workflow status

  2. Security
    - Enable RLS
    - Allow public INSERT (lead capture form is public, no auth required)
    - Allow authenticated admin SELECT/UPDATE for lead management

  3. Notes
    - No sensitive personal data beyond standard contact info
    - status column supports admin triage: new, contacted, qualified, declined
*/

CREATE TABLE IF NOT EXISTS cp360_leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz DEFAULT now() NOT NULL,
  full_name           text NOT NULL DEFAULT '',
  company_name        text NOT NULL DEFAULT '',
  email               text NOT NULL DEFAULT '',
  phone               text DEFAULT '',
  website             text DEFAULT '',
  city_state          text DEFAULT '',
  contractor_type     text DEFAULT '',
  active_projects     text DEFAULT '',
  biggest_challenge   text DEFAULT '',
  pilot_project_notes text DEFAULT '',
  status              text NOT NULL DEFAULT 'new'
);

ALTER TABLE cp360_leads ENABLE ROW LEVEL SECURITY;

-- Public INSERT: anyone can submit a lead (no auth required — public landing page)
CREATE POLICY "Public can insert leads"
  ON cp360_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Authenticated users (admins) can read all leads
CREATE POLICY "Authenticated users can read leads"
  ON cp360_leads
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users (admins) can update lead status
CREATE POLICY "Authenticated users can update lead status"
  ON cp360_leads
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
