-- Add deep-link fields to notifications table for task response alerts
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS task_id        uuid         REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type    text,
  ADD COLUMN IF NOT EXISTS source_id      text,
  ADD COLUMN IF NOT EXISTS detail         text,
  ADD COLUMN IF NOT EXISTS read_at        timestamptz,
  ADD COLUMN IF NOT EXISTS action_label   text,
  ADD COLUMN IF NOT EXISTS action_target  text;

-- Sync existing status='read' rows to have a read_at timestamp
UPDATE notifications
SET read_at = created_at
WHERE status = 'read' AND read_at IS NULL;

-- Index for fast per-user notification lookup
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_task_id ON notifications (task_id);
