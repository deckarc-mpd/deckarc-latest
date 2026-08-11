/*
  # Seed Sample Data

  ## Summary
  Seeds 3 DECKARC sample projects with tasks, permits, inspections, and other data.
  Also creates a trigger to auto-create user profiles on signup.

  ## Notes
  - Projects are seeded directly without auth users (auth users must sign up)
  - A trigger is created to auto-populate user_profiles on auth.users insert
  - Projects reference the DECKARC LLC organization
*/

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'SUBCONTRACTOR')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Seed Projects (organization DECKARC LLC = 00000000-0000-0000-0000-000000000002)
INSERT INTO projects (
  id, organization_id, project_name, client_name, client_email,
  address, city, state, zip, project_type, description,
  start_date, expected_finish_date, projected_finish_date,
  status, progress_percentage, alert_status,
  internal_notes, client_visible_notes
) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000002',
  'Vik Room Addition',
  'Vik',
  'client@test.com',
  '123 Sample Drive',
  'Charlotte', 'NC', '28269',
  'Single-story room addition',
  'Single-story room addition project. Plans completed. Demo completed. Debris cleanup in progress.',
  '2025-03-01',
  '2025-07-30',
  '2025-08-05',
  'In Progress',
  35,
  'yellow',
  'Plans completed. Demo completed. Debris cleanup in progress. Foundation in progress. 811 utility marking pending. Permit status to be confirmed.',
  'Your room addition is progressing. Foundation work is currently underway. We will keep you updated on the next confirmed milestones.'
),
(
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000002',
  'Ganesh Living Room Extension',
  'Ganesh',
  'ganesh@test.com',
  '14714 Brick Church Court',
  'Charlotte', 'NC', '28277',
  'Two-story high ceiling living room extension',
  'Two-story high ceiling living room extension. Plans completed. Foundation in progress. Framing upcoming.',
  '2025-04-01',
  '2025-09-15',
  '2025-09-15',
  'In Progress',
  20,
  'yellow',
  'Plans completed. Foundation in progress. Framing upcoming. Windows/doors lead time pending. Permit and inspection tracking required.',
  'Your living room extension is in the early construction phase. Foundation is in progress and framing will begin soon.'
),
(
  '33333333-3333-3333-3333-333333333333',
  '00000000-0000-0000-0000-000000000002',
  'Sample Bathroom Remodel',
  'Sample Client',
  'sampleclient@test.com',
  '456 Oak Lane',
  'Charlotte', 'NC', '28210',
  'Bathroom upgrade',
  'Complete bathroom upgrade including plumbing rough-in, tile work, vanity installation, and final walkthrough.',
  '2025-06-01',
  '2025-08-01',
  '2025-08-01',
  'Planning',
  5,
  'green',
  'Material selection pending. Plumbing rough-in, tile work, vanity installation, and final walkthrough to be tracked.',
  'Your bathroom remodel is in the planning phase. Material selections are being finalized.'
)
ON CONFLICT (id) DO NOTHING;

-- Seed Tasks for Vik Room Addition
INSERT INTO tasks (project_id, task_name, category, status, progress_percentage, planned_start_date, planned_finish_date, actual_start_date, actual_finish_date, is_client_visible, client_visible_notes, alert_status) VALUES
('11111111-1111-1111-1111-111111111111', 'Design & Plans', 'Design', 'Completed', 100, '2025-03-01', '2025-03-15', '2025-03-01', '2025-03-14', true, 'Architectural plans completed and approved.', 'green'),
('11111111-1111-1111-1111-111111111111', 'Demo & Site Prep', 'Site Prep', 'Completed', 100, '2025-03-16', '2025-03-25', '2025-03-16', '2025-03-25', true, 'Demolition and debris cleanup completed.', 'green'),
('11111111-1111-1111-1111-111111111111', '811 Utility Marking', 'Site Prep', 'In Progress', 60, '2025-03-26', '2025-04-05', '2025-03-26', NULL, false, NULL, 'yellow'),
('11111111-1111-1111-1111-111111111111', 'Permit Application', 'Permit', 'In Progress', 50, '2025-03-20', '2025-04-10', '2025-03-20', NULL, false, NULL, 'yellow'),
('11111111-1111-1111-1111-111111111111', 'Foundation Work', 'Foundation', 'In Progress', 40, '2025-04-01', '2025-04-20', '2025-04-05', NULL, true, 'Foundation work is currently in progress.', 'yellow'),
('11111111-1111-1111-1111-111111111111', 'Framing', 'Framing', 'Not Started', 0, '2025-04-21', '2025-05-15', NULL, NULL, true, 'Framing will begin once foundation is complete.', 'green'),
('11111111-1111-1111-1111-111111111111', 'Roofing', 'Roofing', 'Not Started', 0, '2025-05-16', '2025-06-05', NULL, NULL, false, NULL, 'green'),
('11111111-1111-1111-1111-111111111111', 'Electrical Rough-in', 'Electrical', 'Not Started', 0, '2025-06-01', '2025-06-20', NULL, NULL, false, NULL, 'green'),
('11111111-1111-1111-1111-111111111111', 'Plumbing Rough-in', 'Plumbing', 'Not Started', 0, '2025-06-01', '2025-06-20', NULL, NULL, false, NULL, 'green'),
('11111111-1111-1111-1111-111111111111', 'Insulation & Drywall', 'Insulation', 'Not Started', 0, '2025-06-21', '2025-07-10', NULL, NULL, false, NULL, 'green'),
('11111111-1111-1111-1111-111111111111', 'Finish Work', 'Finish', 'Not Started', 0, '2025-07-11', '2025-07-25', NULL, NULL, true, 'Final finishes and trim work.', 'green'),
('11111111-1111-1111-1111-111111111111', 'Final Inspection', 'Inspection', 'Not Started', 0, '2025-07-26', '2025-07-30', NULL, NULL, true, 'Final walkthrough and inspection.', 'green')
ON CONFLICT DO NOTHING;

-- Seed Tasks for Ganesh Living Room Extension
INSERT INTO tasks (project_id, task_name, category, status, progress_percentage, planned_start_date, planned_finish_date, actual_start_date, actual_finish_date, is_client_visible, client_visible_notes, alert_status) VALUES
('22222222-2222-2222-2222-222222222222', 'Design & Plans', 'Design', 'Completed', 100, '2025-04-01', '2025-04-20', '2025-04-01', '2025-04-18', true, 'Design plans completed.', 'green'),
('22222222-2222-2222-2222-222222222222', 'Permit Submission', 'Permit', 'In Progress', 30, '2025-04-20', '2025-05-10', '2025-04-20', NULL, false, NULL, 'yellow'),
('22222222-2222-2222-2222-222222222222', 'Foundation', 'Foundation', 'In Progress', 50, '2025-05-01', '2025-05-25', '2025-05-05', NULL, true, 'Foundation excavation and concrete pour in progress.', 'yellow'),
('22222222-2222-2222-2222-222222222222', 'Windows & Doors Order', 'Design', 'In Progress', 10, '2025-04-25', '2025-05-15', '2025-04-25', NULL, true, 'Custom windows and doors have been ordered. Lead time is 6-8 weeks.', 'yellow'),
('22222222-2222-2222-2222-222222222222', 'Framing', 'Framing', 'Not Started', 0, '2025-05-26', '2025-06-25', NULL, NULL, true, 'Framing will begin once foundation is cured.', 'green'),
('22222222-2222-2222-2222-222222222222', 'Framing Inspection', 'Inspection', 'Not Started', 0, '2025-06-26', '2025-06-30', NULL, NULL, false, NULL, 'green'),
('22222222-2222-2222-2222-222222222222', 'Roofing', 'Roofing', 'Not Started', 0, '2025-07-01', '2025-07-20', NULL, NULL, false, NULL, 'green'),
('22222222-2222-2222-2222-222222222222', 'Electrical & Plumbing', 'Electrical', 'Not Started', 0, '2025-07-21', '2025-08-15', NULL, NULL, false, NULL, 'green'),
('22222222-2222-2222-2222-222222222222', 'Insulation & Drywall', 'Insulation', 'Not Started', 0, '2025-08-16', '2025-09-01', NULL, NULL, false, NULL, 'green'),
('22222222-2222-2222-2222-222222222222', 'Final Finish & Walkthrough', 'Finish', 'Not Started', 0, '2025-09-02', '2025-09-15', NULL, NULL, true, 'Final finishes, punch list, and client walkthrough.', 'green')
ON CONFLICT DO NOTHING;

-- Seed Tasks for Sample Bathroom Remodel
INSERT INTO tasks (project_id, task_name, category, status, progress_percentage, planned_start_date, planned_finish_date, actual_start_date, actual_finish_date, is_client_visible, client_visible_notes, alert_status) VALUES
('33333333-3333-3333-3333-333333333333', 'Material Selection', 'Design', 'In Progress', 20, '2025-06-01', '2025-06-14', '2025-06-01', NULL, true, 'Please confirm tile, vanity, and fixture selections.', 'yellow'),
('33333333-3333-3333-3333-333333333333', 'Demo & Prep', 'Site Prep', 'Not Started', 0, '2025-06-15', '2025-06-20', NULL, NULL, false, NULL, 'green'),
('33333333-3333-3333-3333-333333333333', 'Plumbing Rough-in', 'Plumbing', 'Not Started', 0, '2025-06-21', '2025-06-28', NULL, NULL, false, NULL, 'green'),
('33333333-3333-3333-3333-333333333333', 'Plumbing Inspection', 'Inspection', 'Not Started', 0, '2025-06-29', '2025-06-30', NULL, NULL, false, NULL, 'green'),
('33333333-3333-3333-3333-333333333333', 'Tile Work', 'Flooring', 'Not Started', 0, '2025-07-01', '2025-07-12', NULL, NULL, true, 'Tile installation for floor and shower.', 'green'),
('33333333-3333-3333-3333-333333333333', 'Vanity & Fixture Install', 'Finish', 'Not Started', 0, '2025-07-13', '2025-07-22', NULL, NULL, true, 'Vanity, fixtures, and mirror installation.', 'green'),
('33333333-3333-3333-3333-333333333333', 'Final Walkthrough', 'Inspection', 'Not Started', 0, '2025-07-23', '2025-08-01', NULL, NULL, true, 'Final inspection and client walkthrough.', 'green')
ON CONFLICT DO NOTHING;

-- Seed Permits for Vik Room Addition
INSERT INTO permits (project_id, permit_required, permit_type, permit_status, submitted_date, notes, alert_status) VALUES
('11111111-1111-1111-1111-111111111111', true, 'Building Permit - Room Addition', 'Under Review', '2025-03-22', 'Submitted to Charlotte Mecklenburg. Awaiting review.', 'yellow'),
('22222222-2222-2222-2222-222222222222', true, 'Building Permit - Living Room Extension', 'Submitted', '2025-04-22', 'Submitted. Pending city review.', 'yellow'),
('33333333-3333-3333-3333-333333333333', true, 'Building Permit - Bathroom Remodel', 'Not Started', NULL, 'Permit to be submitted before demo begins.', 'yellow')
ON CONFLICT DO NOTHING;

-- Seed Inspections
INSERT INTO inspections (project_id, inspection_type, scheduled_date, result, notes, alert_status) VALUES
('11111111-1111-1111-1111-111111111111', 'Foundation', NULL, 'Not Scheduled', 'Schedule after foundation pour is complete.', 'yellow'),
('22222222-2222-2222-2222-222222222222', 'Foundation', NULL, 'Not Scheduled', 'Schedule once foundation is ready.', 'yellow'),
('22222222-2222-2222-2222-222222222222', 'Framing', NULL, 'Not Scheduled', 'Schedule after framing is complete.', 'yellow')
ON CONFLICT DO NOTHING;

-- Seed Client Decisions for Ganesh project
INSERT INTO client_decisions (project_id, decision_title, description, needed_by_date, status, time_impact_days, client_visible_note, alert_status) VALUES
('22222222-2222-2222-2222-222222222222', 'Window & Door Style Confirmation', 'Please confirm the final selection for windows and exterior doors. This will impact the framing and lead time.', '2025-05-20', 'Waiting on Client', 7, 'We need your window and door selection confirmed by May 20 to avoid delays to framing.', 'yellow'),
('33333333-3333-3333-3333-333333333333', 'Tile Selection', 'Choose floor tile, shower tile, and accent tile for bathroom remodel.', '2025-06-10', 'Needed', 5, 'Please select your tile preferences before June 10 to keep the project on schedule.', 'yellow')
ON CONFLICT DO NOTHING;
