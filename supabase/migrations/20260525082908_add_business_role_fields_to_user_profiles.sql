/*
  # Add Business and Role-Specific Fields to user_profiles

  ## Summary
  Extends user_profiles with fields required for role-conditional profile sections
  and Task Assignment readiness. All columns are nullable with no default to avoid
  masking missing data. No auth logic is changed. No passwords are stored here.

  ## New Columns

  ### Identity / Business
  - `company_name` (text) — Company or business name; used by Admin, GC, Sub, Vendor
  - `title` (text) — Job title or role label (e.g. "Project Superintendent")
  - `avatar_url` (text) — URL to profile photo in Supabase Storage

  ### Contractor Compliance (GC)
  - `license_number` (text) — Contractor license number
  - `license_state` (text) — State that issued the license (e.g. "NC")
  - `license_expiration` (date) — License expiry date
  - `insurance_status` (text) — Current / Expired / Pending
  - `coi_expiration` (date) — Certificate of Insurance expiry date

  ### Subcontractor / Field
  - `trade_specialty` (text) — Trade or specialty (e.g. "Electrical", "Framing")
  - `crew_size` (integer) — Approximate crew size (optional)

  ### Client
  - `preferred_contact_method` (text) — email / phone / sms

  ### Emergency Contact (GC, optional)
  - `emergency_contact_name` (text)
  - `emergency_contact_phone` (text)

  ## Security
  - No RLS policy changes needed — existing "Users can update their own profile"
    policy on user_profiles already covers all new columns for self-service edits.
  - Admin can update any profile via existing admin update policies.
  - Sensitive fields (EIN, license, insurance, emergency contact) are governed by
    the same RLS as the rest of user_profiles — authenticated users can read all
    profiles (SELECT USING true), but only owners can update their own row.
    A follow-up audit may tighten SELECT to hide sensitive fields from non-admins
    when that requirement is confirmed.

  ## Notes
  - Passwords are NOT stored here. All auth is Supabase Auth only.
  - All columns use IF NOT EXISTS to be safe against re-runs.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'company_name') THEN
    ALTER TABLE user_profiles ADD COLUMN company_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'title') THEN
    ALTER TABLE user_profiles ADD COLUMN title text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'avatar_url') THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'license_number') THEN
    ALTER TABLE user_profiles ADD COLUMN license_number text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'license_state') THEN
    ALTER TABLE user_profiles ADD COLUMN license_state text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'license_expiration') THEN
    ALTER TABLE user_profiles ADD COLUMN license_expiration date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'insurance_status') THEN
    ALTER TABLE user_profiles ADD COLUMN insurance_status text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'coi_expiration') THEN
    ALTER TABLE user_profiles ADD COLUMN coi_expiration date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'trade_specialty') THEN
    ALTER TABLE user_profiles ADD COLUMN trade_specialty text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'crew_size') THEN
    ALTER TABLE user_profiles ADD COLUMN crew_size integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'preferred_contact_method') THEN
    ALTER TABLE user_profiles ADD COLUMN preferred_contact_method text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'emergency_contact_name') THEN
    ALTER TABLE user_profiles ADD COLUMN emergency_contact_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'emergency_contact_phone') THEN
    ALTER TABLE user_profiles ADD COLUMN emergency_contact_phone text;
  END IF;
END $$;
