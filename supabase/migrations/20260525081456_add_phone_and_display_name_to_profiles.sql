/*
  # Add phone_number and display_name to user_profiles

  1. Changes
    - `user_profiles` table gains two optional columns:
      - `phone_number` (text, nullable) — user's contact phone number
      - `display_name` (text, nullable) — optional preferred display name

  2. Notes
    - Both columns are nullable and have no default to avoid masking missing data
    - No RLS changes needed — existing "Users can update their own profile" policy already
      covers updates to all columns on user_profiles for the owning user
    - Admins who update profiles via user_profiles UPDATE will also be covered by
      existing admin policies in later migrations
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN phone_number text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN display_name text;
  END IF;
END $$;
