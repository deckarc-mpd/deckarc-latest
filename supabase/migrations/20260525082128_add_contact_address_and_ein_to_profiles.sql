/*
  # Add contact_address and ein to user_profiles

  1. Changes
    - `user_profiles` gains two optional columns:
      - `contact_address` (text, nullable) — street / mailing address for the user
      - `ein` (text, nullable) — Employer Identification Number (stored as text to preserve
        formatting such as leading zeros and hyphens, e.g. "12-3456789")

  2. Security
    - Both columns are nullable with no default
    - EIN is stored in the application profile table only — it is never passed to
      Supabase Auth and is not a credential. Access is governed by the existing RLS
      policies on user_profiles (users can update their own row; admins can view all).
    - No new RLS policies required.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'contact_address'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN contact_address text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'ein'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN ein text;
  END IF;
END $$;
