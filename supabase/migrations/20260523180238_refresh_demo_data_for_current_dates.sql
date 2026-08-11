/*
  # Refresh Demo Data for Current Dates

  Updates all sample data to current/future dates for a realistic demo on 2026-05-23.
*/

-- Update project dates and statuses
UPDATE projects SET start_date = '2026-03-01', expected_finish_date = '2026-07-30', projected_finish_date = '2026-08-12', status = 'Delayed', alert_status = 'red', progress_percentage = 35 WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE projects SET start_date = '2026-04-01', expected_finish_date = '2026-09-15', projected_finish_date = '2026-09-18', status = 'In Progress', alert_status = 'yellow', progress_percentage = 20 WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE projects SET start_date = '2026-05-01', expected_finish_date = '2026-08-01', projected_finish_date = '2026-08-01', status = 'In Progress', alert_status = 'green', progress_percentage = 15 WHERE id = '33333333-3333-3333-3333-333333333333';

-- Vik Room Addition tasks
UPDATE tasks SET status = 'Completed', progress_percentage = 100, planned_finish_date = '2026-03-15', actual_finish_date = '2026-03-15' WHERE task_name = 'Design & Plans' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET status = 'Completed', progress_percentage = 100, planned_finish_date = '2026-03-25', actual_finish_date = '2026-03-28' WHERE task_name = 'Demo & Site Prep' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET status = 'Completed', progress_percentage = 100, planned_finish_date = '2026-04-05', actual_finish_date = '2026-04-05' WHERE task_name = '811 Utility Marking' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET status = 'Delayed', progress_percentage = 60, planned_start_date = '2026-04-01', planned_finish_date = '2026-04-20', projected_finish_date = '2026-05-05', delay_days = 15, delay_reason = 'City permit office backlog — correction requested on structural plans', alert_status = 'red' WHERE task_name = 'Permit Application' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET status = 'In Progress', progress_percentage = 40, planned_start_date = '2026-04-21', planned_finish_date = '2026-05-10', projected_finish_date = '2026-05-22', delay_days = 12, delay_reason = 'Rain delay — concrete pour postponed twice', alert_status = 'red' WHERE task_name = 'Foundation Work' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET status = 'Not Started', planned_start_date = '2026-05-25', planned_finish_date = '2026-06-20', projected_start_date = '2026-06-05', projected_finish_date = '2026-07-02' WHERE task_name = 'Framing' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET planned_start_date = '2026-06-25', planned_finish_date = '2026-07-15' WHERE task_name = 'Roofing' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET planned_start_date = '2026-07-16', planned_finish_date = '2026-07-28' WHERE task_name = 'Electrical Rough-in' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET planned_start_date = '2026-07-16', planned_finish_date = '2026-07-28' WHERE task_name = 'Plumbing Rough-in' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET planned_start_date = '2026-07-29', planned_finish_date = '2026-08-15' WHERE task_name = 'Insulation & Drywall' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET planned_start_date = '2026-08-16', planned_finish_date = '2026-08-28' WHERE task_name = 'Finish Work' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE tasks SET planned_start_date = '2026-08-29', planned_finish_date = '2026-09-05' WHERE task_name = 'Final Inspection' AND project_id = '11111111-1111-1111-1111-111111111111';

-- Ganesh Living Room Extension tasks
UPDATE tasks SET status = 'Completed', progress_percentage = 100, planned_finish_date = '2026-04-20', actual_finish_date = '2026-04-18' WHERE task_name = 'Design & Plans' AND project_id = '22222222-2222-2222-2222-222222222222';
UPDATE tasks SET status = 'In Progress', progress_percentage = 70, planned_start_date = '2026-04-25', planned_finish_date = '2026-05-15', alert_status = 'yellow' WHERE task_name = 'Permit Submission' AND project_id = '22222222-2222-2222-2222-222222222222';
UPDATE tasks SET status = 'In Progress', progress_percentage = 30, planned_start_date = '2026-05-10', planned_finish_date = '2026-05-28', projected_start_date = '2026-05-13', projected_finish_date = '2026-05-31', delay_days = 3, delay_reason = 'Soil conditions required additional grading — extra excavation needed', alert_status = 'red' WHERE task_name = 'Foundation' AND project_id = '22222222-2222-2222-2222-222222222222';
UPDATE tasks SET status = 'In Progress', progress_percentage = 50, planned_start_date = '2026-05-01', planned_finish_date = '2026-05-25' WHERE task_name = 'Windows & Doors Order' AND project_id = '22222222-2222-2222-2222-222222222222';
UPDATE tasks SET status = 'Not Started', planned_start_date = '2026-06-01', planned_finish_date = '2026-06-28', projected_start_date = '2026-06-04', projected_finish_date = '2026-07-01' WHERE task_name = 'Framing' AND project_id = '22222222-2222-2222-2222-222222222222';
UPDATE tasks SET planned_start_date = '2026-07-02', planned_finish_date = '2026-07-07' WHERE task_name = 'Framing Inspection' AND project_id = '22222222-2222-2222-2222-222222222222';
UPDATE tasks SET planned_start_date = '2026-07-08', planned_finish_date = '2026-07-28' WHERE task_name = 'Roofing' AND project_id = '22222222-2222-2222-2222-222222222222';
UPDATE tasks SET planned_start_date = '2026-07-29', planned_finish_date = '2026-08-25' WHERE task_name = 'Electrical & Plumbing' AND project_id = '22222222-2222-2222-2222-222222222222';

-- Inspections
UPDATE inspections SET result = 'Correction Required', inspection_status = 'Correction Required', scheduled_date = '2026-05-12', result_date = '2026-05-12', correction_required = true, correction_notes = 'Footing depth inadequate — must be 18 inch minimum per local code. Needs re-pour before reinspection.', reinspection_required = true, reinspection_requested_date = '2026-05-20', alert_status = 'red' WHERE inspection_type = 'Foundation' AND project_id = '11111111-1111-1111-1111-111111111111';
UPDATE inspections SET result = 'Scheduled', inspection_status = 'Scheduled', requested_date = '2026-05-22', scheduled_date = '2026-05-28', jurisdiction = 'Cobb County', alert_status = 'yellow' WHERE inspection_type = 'Foundation' AND project_id = '22222222-2222-2222-2222-222222222222';

-- Permits
UPDATE permits SET permit_status = 'Correction Requested', revision_requested = true, revision_notes = 'Structural calculations must be stamped by licensed engineer. Resubmit with PE stamp.', alert_status = 'red' WHERE project_id = '11111111-1111-1111-1111-111111111111';

-- Payment milestones
UPDATE payment_milestones SET status = 'Overdue', due_date = '2026-05-10', alert_status = 'red' WHERE project_id = '11111111-1111-1111-1111-111111111111' AND milestone_name ILIKE '%Foundation%';
UPDATE payment_milestones SET status = 'Due Soon', due_date = '2026-05-30', alert_status = 'yellow' WHERE project_id = '22222222-2222-2222-2222-222222222222' AND milestone_name ILIKE '%Foundation%';

-- Weather risk for Ganesh
INSERT INTO weather_risks (project_id, risk_date, risk_type, risk_level, notes, delay_days, alert_status)
SELECT '22222222-2222-2222-2222-222222222222', CURRENT_DATE + 2, 'Heavy Rain', 'High', 'Thunderstorms expected — 1.5 inches rainfall over 2 days. Concrete work cannot proceed. Foundation pour may need to be rescheduled +2 days.', 2, 'red'
WHERE NOT EXISTS (SELECT 1 FROM weather_risks WHERE project_id = '22222222-2222-2222-2222-222222222222' AND risk_type = 'Heavy Rain');

-- Incident for Vik
INSERT INTO incidents (project_id, incident_date, incident_title, incident_description, severity_level, incident_status, delay_expected, estimated_delay_days)
SELECT '11111111-1111-1111-1111-111111111111', '2026-05-18', 'Footing Inspection Failed — Work Hold', 'Foundation footing inspection failed. Inspector cited inadequate depth at NE corner. Work stopped pending correction and reinspection.', 'High', 'Open', true, 5
WHERE NOT EXISTS (SELECT 1 FROM incidents WHERE project_id = '11111111-1111-1111-1111-111111111111' AND incident_title = 'Footing Inspection Failed — Work Hold');

-- Schedule change requests
INSERT INTO schedule_change_requests (project_id, requested_by_name, requested_by_role, change_type, delay_days, reason, status)
SELECT '22222222-2222-2222-2222-222222222222', 'Mike Hernandez', 'GENERAL_CONTRACTOR', 'Weather Delay', 2, 'Heavy rain forecast for May 25-26 will prevent concrete pour for foundation. Requesting 2-day push on foundation completion.', 'Pending'
WHERE NOT EXISTS (SELECT 1 FROM schedule_change_requests WHERE project_id = '22222222-2222-2222-2222-222222222222' AND requested_by_name = 'Mike Hernandez');

INSERT INTO schedule_change_requests (project_id, requested_by_name, requested_by_role, change_type, delay_days, reason, status)
SELECT '11111111-1111-1111-1111-111111111111', 'Carlos Rivera', 'GENERAL_CONTRACTOR', 'Permit Delay', 10, 'City permit office requested PE-stamped structural calculations. Current turnaround time is 10 business days. Need to push all dependent tasks.', 'Pending'
WHERE NOT EXISTS (SELECT 1 FROM schedule_change_requests WHERE project_id = '11111111-1111-1111-1111-111111111111' AND requested_by_name = 'Carlos Rivera');

-- Client decisions (using actual columns: decision_title, description, needed_by_date, status, client_visible_note)
INSERT INTO client_decisions (project_id, decision_title, description, status, needed_by_date, client_visible_note)
SELECT '33333333-3333-3333-3333-333333333333', 'Tile Selection for Shower', 'Select tile for master shower before tile work begins. Three options provided. If not selected by deadline, installation will be delayed 7-10 days.', 'Pending', CURRENT_DATE + 5, 'Please review the three tile options and confirm your selection by the needed-by date to keep the project on schedule.'
WHERE NOT EXISTS (SELECT 1 FROM client_decisions WHERE project_id = '33333333-3333-3333-3333-333333333333' AND decision_title = 'Tile Selection for Shower');

INSERT INTO client_decisions (project_id, decision_title, description, status, needed_by_date, client_visible_note)
SELECT '11111111-1111-1111-1111-111111111111', 'Exterior Color Selection', 'Select final exterior paint color before paint prep begins. Two palettes provided. Paint prep can begin but final coat will be delayed without selection.', 'Pending', CURRENT_DATE + 14, 'Two color palettes have been shared. Please confirm your selection within 14 days to keep final paint on schedule.'
WHERE NOT EXISTS (SELECT 1 FROM client_decisions WHERE project_id = '11111111-1111-1111-1111-111111111111' AND decision_title = 'Exterior Color Selection');

-- Activity log entries
INSERT INTO activity_log (project_id, user_full_name, user_role, action_type, module, old_value, new_value, notes)
SELECT '11111111-1111-1111-1111-111111111111', 'Carlos Rivera', 'GENERAL_CONTRACTOR', 'Delay Added to Task', 'Task', '0d', '12d', 'Foundation Work — Rain delay, concrete pour postponed twice'
WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE project_id = '11111111-1111-1111-1111-111111111111' AND action_type = 'Delay Added to Task' AND new_value = '12d');

INSERT INTO activity_log (project_id, user_full_name, user_role, action_type, module, old_value, new_value, notes)
SELECT '11111111-1111-1111-1111-111111111111', 'System', 'System', 'Inspection Result Changed', 'Inspection', 'Scheduled', 'Correction Required', 'Foundation inspection — footing depth inadequate at NE corner'
WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE project_id = '11111111-1111-1111-1111-111111111111' AND action_type = 'Inspection Result Changed');

INSERT INTO activity_log (project_id, user_full_name, user_role, action_type, module, old_value, new_value, notes)
SELECT '22222222-2222-2222-2222-222222222222', 'Mike Hernandez', 'GENERAL_CONTRACTOR', 'Delay Added to Task', 'Task', '0d', '3d', 'Foundation — soil conditions required additional grading'
WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE project_id = '22222222-2222-2222-2222-222222222222' AND action_type = 'Delay Added to Task');
