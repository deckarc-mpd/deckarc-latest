/*
  # Re-seed project_users with new auth user IDs

  The test users were recreated via Admin API with new UUIDs.
  This assigns all 3 projects to each team member.
*/

DO $$
DECLARE
  v_convazant uuid;
  v_deckarc   uuid;
  v_gc        uuid;
  v_sub       uuid;
  v_client    uuid;
BEGIN
  SELECT id INTO v_convazant FROM auth.users WHERE email = 'convazant.admin@test.com';
  SELECT id INTO v_deckarc   FROM auth.users WHERE email = 'deckarc.admin@test.com';
  SELECT id INTO v_gc        FROM auth.users WHERE email = 'gc@test.com';
  SELECT id INTO v_sub       FROM auth.users WHERE email = 'subcontractor@test.com';
  SELECT id INTO v_client    FROM auth.users WHERE email = 'client@test.com';

  INSERT INTO project_users (project_id, user_id, role_on_project) VALUES
    ('11111111-1111-1111-1111-111111111111', v_convazant, 'CONVAZANT_SUPER_ADMIN'),
    ('11111111-1111-1111-1111-111111111111', v_deckarc,   'DECKARC_ADMIN'),
    ('11111111-1111-1111-1111-111111111111', v_gc,        'GENERAL_CONTRACTOR'),
    ('11111111-1111-1111-1111-111111111111', v_sub,       'SUBCONTRACTOR'),
    ('11111111-1111-1111-1111-111111111111', v_client,    'CLIENT'),

    ('22222222-2222-2222-2222-222222222222', v_convazant, 'CONVAZANT_SUPER_ADMIN'),
    ('22222222-2222-2222-2222-222222222222', v_deckarc,   'DECKARC_ADMIN'),
    ('22222222-2222-2222-2222-222222222222', v_gc,        'GENERAL_CONTRACTOR'),
    ('22222222-2222-2222-2222-222222222222', v_sub,       'SUBCONTRACTOR'),
    ('22222222-2222-2222-2222-222222222222', v_client,    'CLIENT'),

    ('33333333-3333-3333-3333-333333333333', v_convazant, 'CONVAZANT_SUPER_ADMIN'),
    ('33333333-3333-3333-3333-333333333333', v_deckarc,   'DECKARC_ADMIN'),
    ('33333333-3333-3333-3333-333333333333', v_gc,        'GENERAL_CONTRACTOR'),
    ('33333333-3333-3333-3333-333333333333', v_sub,       'SUBCONTRACTOR'),
    ('33333333-3333-3333-3333-333333333333', v_client,    'CLIENT')
  ON CONFLICT (project_id, user_id) DO NOTHING;
END $$;
