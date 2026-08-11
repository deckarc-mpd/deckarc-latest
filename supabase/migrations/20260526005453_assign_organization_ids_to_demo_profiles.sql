/*
  # Assign organization_id to demo profiles

  ## Summary
  All demo user profiles had organization_id = null, causing the project
  creation to fetch the wrong organization (CONVAZANT INC instead of DECKARC LLC).

  This migration assigns the correct organization to each demo profile:
  - DECKARC_ADMIN, GENERAL_CONTRACTOR, SUBCONTRACTOR, CLIENT → DECKARC LLC
  - CONVAZANT_SUPER_ADMIN → CONVAZANT INC

  Also assigns organization_id to the existing demo projects which currently have
  the wrong org (they were seeded before org IDs were populated).
*/

-- DECKARC LLC org id
UPDATE user_profiles
SET organization_id = '00000000-0000-0000-0000-000000000002'
WHERE role IN ('DECKARC_ADMIN', 'GENERAL_CONTRACTOR', 'SUBCONTRACTOR', 'CLIENT')
  AND organization_id IS NULL;

-- CONVAZANT INC org id
UPDATE user_profiles
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE role = 'CONVAZANT_SUPER_ADMIN'
  AND organization_id IS NULL;

-- Fix existing demo projects to belong to DECKARC LLC
UPDATE projects
SET organization_id = '00000000-0000-0000-0000-000000000002'
WHERE organization_id IS NULL
   OR organization_id = '00000000-0000-0000-0000-000000000001';
