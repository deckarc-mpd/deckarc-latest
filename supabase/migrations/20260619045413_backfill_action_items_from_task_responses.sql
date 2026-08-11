-- Backfill action_items for tasks in Needs Review / Ready for Review status
-- that have at least one non-admin field response but no open action_item yet.
-- Uses INSERT ... ON CONFLICT DO NOTHING so it is safe to run multiple times.

INSERT INTO action_items (
  action_title,
  action_description,
  project_id,
  related_task_id,
  priority,
  source_type,
  source_id,
  status,
  created_at
)
SELECT
  t.task_name,
  CASE tr.response_type
    WHEN 'question'      THEN 'Question from field user — review and respond'
    WHEN 'accepted'      THEN 'Field user accepted task — review and confirm'
    WHEN 'declined'      THEN 'Field user declined task — action required'
    WHEN 'daily_update'  THEN 'Daily update submitted — review blockers'
    WHEN 'material_list' THEN 'Material list submitted — review and approve'
    WHEN 'quote'         THEN 'Quote submitted — review and approve'
    ELSE                      'Field response submitted — review required'
  END,
  t.project_id,
  t.id,
  CASE WHEN tr.response_type = 'question' THEN 'High' ELSE 'Medium' END,
  'task_response',
  'task-review-' || t.id,
  'Open',
  tr.created_at
FROM task_responses tr
JOIN tasks t ON t.id = tr.task_id
WHERE t.status IN ('Needs Review', 'Ready for Review')
  AND t.is_deleted = false
  AND tr.response_type != 'admin_reply'
  -- Only the most recent non-admin response per task drives the action item
  AND tr.created_at = (
    SELECT MAX(tr2.created_at)
    FROM task_responses tr2
    WHERE tr2.task_id = t.id
      AND tr2.response_type != 'admin_reply'
  )
  -- Skip if an open action_item already exists for this task
  AND NOT EXISTS (
    SELECT 1 FROM action_items ai
    WHERE ai.source_id = 'task-review-' || t.id
      AND ai.status != 'Done'
  )
ON CONFLICT DO NOTHING;
