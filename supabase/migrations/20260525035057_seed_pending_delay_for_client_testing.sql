/*
  # Seed Pending Delay Reason for Client Testing

  Adds one delay reason record with status "Pending Response" so the
  client dashboard shows it in "Action Needed From You" → Request Review.

  This record is:
  - Visible to client
  - Requires client response
  - Status is "Pending Response" (the value the client dashboard filters on)
  - Tied to project 11111111 (Vik Room Addition)
*/

INSERT INTO project_delay_reasons (
  id,
  project_id,
  delay_category,
  internal_reason,
  client_safe_reason,
  estimated_delay_days,
  client_visible,
  client_visibility_status,
  client_response_required,
  client_response_status,
  auto_acknowledgement_enabled,
  response_deadline,
  status
)
VALUES (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  'Weather',
  'Heavy rain saturated the soil — concrete pour must be rescheduled.',
  'Rain this week delayed the concrete pour. We have rescheduled for next Monday and expect a 3-day impact on the overall timeline.',
  3,
  true,
  'Visible to Client',
  true,
  'Pending Response',
  true,
  (now() + interval '3 days')::date,
  'Waiting on Client'
)
ON CONFLICT DO NOTHING;
