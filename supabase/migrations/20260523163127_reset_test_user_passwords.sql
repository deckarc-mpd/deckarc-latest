/*
  # Reset test user passwords

  Updates all 5 seeded test accounts to use a freshly generated bcrypt hash
  for the password "Test1234!" to ensure login works correctly.
  Also sets email_confirmed_at to ensure accounts are not blocked.
*/

DO $$
DECLARE
  new_hash text;
BEGIN
  new_hash := extensions.crypt('Test1234!', extensions.gen_salt('bf', 10));

  UPDATE auth.users
  SET
    encrypted_password = new_hash,
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
  WHERE email IN (
    'convazant.admin@test.com',
    'deckarc.admin@test.com',
    'gc@test.com',
    'subcontractor@test.com',
    'client@test.com'
  );
END $$;
