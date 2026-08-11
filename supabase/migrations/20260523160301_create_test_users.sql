/*
  # Create Test Auth Users

  ## Summary
  Creates 5 test user accounts with hashed passwords for demo purposes.
  Uses Supabase's auth.users table directly with bcrypt-hashed passwords.

  ## Test Accounts
  - convazant.admin@test.com — CONVAZANT_SUPER_ADMIN
  - deckarc.admin@test.com — DECKARC_ADMIN
  - gc@test.com — GENERAL_CONTRACTOR
  - subcontractor@test.com — SUBCONTRACTOR
  - client@test.com — CLIENT

  All passwords: Test1234!
*/

-- Insert test users into auth.users
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, role, aud
)
VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000000',
  'convazant.admin@test.com',
  crypt('Test1234!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"CONVAZANT Admin","role":"CONVAZANT_SUPER_ADMIN"}',
  false, 'authenticated', 'authenticated'
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '00000000-0000-0000-0000-000000000000',
  'deckarc.admin@test.com',
  crypt('Test1234!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"DECKARC Admin","role":"DECKARC_ADMIN"}',
  false, 'authenticated', 'authenticated'
),
(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '00000000-0000-0000-0000-000000000000',
  'gc@test.com',
  crypt('Test1234!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"General Contractor","role":"GENERAL_CONTRACTOR"}',
  false, 'authenticated', 'authenticated'
),
(
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '00000000-0000-0000-0000-000000000000',
  'subcontractor@test.com',
  crypt('Test1234!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Subcontractor User","role":"SUBCONTRACTOR"}',
  false, 'authenticated', 'authenticated'
),
(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '00000000-0000-0000-0000-000000000000',
  'client@test.com',
  crypt('Test1234!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Client User","role":"CLIENT"}',
  false, 'authenticated', 'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- Insert corresponding user_profiles
INSERT INTO user_profiles (id, email, full_name, role, organization_id, is_active)
VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'convazant.admin@test.com',
  'CONVAZANT Admin',
  'CONVAZANT_SUPER_ADMIN',
  '00000000-0000-0000-0000-000000000001',
  true
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'deckarc.admin@test.com',
  'DECKARC Admin',
  'DECKARC_ADMIN',
  '00000000-0000-0000-0000-000000000002',
  true
),
(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'gc@test.com',
  'General Contractor',
  'GENERAL_CONTRACTOR',
  '00000000-0000-0000-0000-000000000002',
  true
),
(
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'subcontractor@test.com',
  'Subcontractor User',
  'SUBCONTRACTOR',
  '00000000-0000-0000-0000-000000000002',
  true
),
(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'client@test.com',
  'Client User',
  'CLIENT',
  '00000000-0000-0000-0000-000000000002',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Also add auth.identities for email/password login
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"convazant.admin@test.com"}',
  'email', 'convazant.admin@test.com', now(), now(), now()
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"deckarc.admin@test.com"}',
  'email', 'deckarc.admin@test.com', now(), now(), now()
),
(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","email":"gc@test.com"}',
  'email', 'gc@test.com', now(), now(), now()
),
(
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","email":"subcontractor@test.com"}',
  'email', 'subcontractor@test.com', now(), now(), now()
),
(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","email":"client@test.com"}',
  'email', 'client@test.com', now(), now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- Assign GC, Subcontractor, and Client to the 3 projects
INSERT INTO project_users (project_id, user_id, role_on_project)
VALUES
('11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'GENERAL_CONTRACTOR'),
('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'SUBCONTRACTOR'),
('11111111-1111-1111-1111-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'CLIENT'),
('22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'GENERAL_CONTRACTOR'),
('22222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'SUBCONTRACTOR'),
('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'GENERAL_CONTRACTOR')
ON CONFLICT (project_id, user_id) DO NOTHING;
