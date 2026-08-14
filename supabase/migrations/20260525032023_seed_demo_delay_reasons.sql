/*
  # Seed Demo Delay Reasons

  Inserts three realistic project_delay_reasons records so the feature
  is immediately visible in the client portal without requiring manual
  data entry.

  Records:
  1. Pending client response — shows in "Action Needed From You" + "Schedule Updates"
  2. Acknowledged by client — shows in "Latest Approved Updates"
  3. Informational (no response required) — shows in "Schedule Updates" read-only

  All records are client_visible = true and client_visibility_status = 'Visible to Client'
  so the client RLS policy allows them to be read.
*/

INSERT INTO project_delay_reasons (
  id, organization_id, project_id, task_id,
  delay_category, internal_reason, client_safe_reason,
  estimated_delay_days, approved_delay_days,
  schedule_impact_possible, schedule_impact_status,
  client_visible, client_visibility_status,
  client_response_required, client_response_status,
  auto_acknowledgement_enabled,
  response_deadline,
  status, next_action,
  created_by, created_at, updated_at
) VALUES

-- 1. Pending response — will appear in "Action Needed From You"
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  'd9de7268-349d-4e19-be59-915192686542', -- Foundation Work
  'Inspection Failed / Correction Required',
  'Foundation inspection failed — concrete pour depth was 2 inches short on the north wall. Inspector requires correction before framing can begin.',
  'The foundation inspection identified an area that needs a small correction before the next phase can begin. Our team is coordinating the fix.',
  3, 0,
  true, 'Pending Admin Review',
  true, 'Visible to Client',
  true, 'Pending Response',
  true,
  (now() + interval '72 hours'),
  'Waiting on Client',
  'Awaiting client acknowledgement before scheduling correction crew.',
  '151c7472-050a-4d44-8e68-0b595041f8fd',
  now() - interval '1 day',
  now() - interval '1 day'
),

-- 2. Acknowledged — will appear in "Latest Approved Updates"
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  '715f8b19-d4ae-4f82-806e-39b75bd18bbf', -- Demo & Site Prep
  'Weather',
  'Three consecutive rain days prevented concrete pour and site grading from proceeding on schedule.',
  'Wet weather conditions over the past few days slowed site preparation. Our team has adjusted the schedule and is back on track.',
  2, 2,
  true, 'Approved',
  true, 'Visible to Client',
  true, 'Acknowledged by Client',
  false,
  null,
  'Resolved',
  'Schedule adjusted. No further action needed.',
  '151c7472-050a-4d44-8e68-0b595041f8fd',
  now() - interval '5 days',
  now() - interval '3 days'
),

-- 3. Informational (no response required) — visible in Schedule Updates
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000002',
  '22222222-2222-2222-2222-222222222222',
  null,
  'Permit Pending',
  'County permit office is running 5 business days behind on reviews. Standard processing delay.',
  'The permit approval process is taking a few extra days through the county office. This is a normal part of the process and does not require anything from you.',
  5, 0,
  true, 'Possible Impact',
  true, 'Visible to Client',
  false, 'Not Required',
  false,
  null,
  'Under Review',
  'Monitoring permit status daily. Will update when approved.',
  '151c7472-050a-4d44-8e68-0b595041f8fd',
  now() - interval '2 days',
  now() - interval '1 day'
);
