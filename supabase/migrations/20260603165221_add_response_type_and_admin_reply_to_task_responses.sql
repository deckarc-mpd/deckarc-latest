/*
  # Add response_type, responder_role to task_responses + admin reply RLS

  ## Changes
  1. New Columns on task_responses
     - `response_type` (text, default 'general') — accepted, declined, question,
       material_list, quote, daily_update, admin_reply, general
     - `responder_role` (text, default '') — stored at insert time so conversation
       trail can display role without a join

  2. RLS Updates
     - Drop the old "Responder can view own responses" sub policy
     - Replace with a policy that also lets subs read admin_reply responses
       on tasks directly assigned to them (so they see admin answers)
     - Admin/GC SELECT policy is unchanged
*/

-- 1. Add columns
ALTER TABLE task_responses
  ADD COLUMN IF NOT EXISTS response_type text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS responder_role text NOT NULL DEFAULT '';

-- 2. Drop old sub-scoped SELECT policy
DROP POLICY IF EXISTS "Responder can view own responses" ON task_responses;

-- 3. New sub SELECT policy: own responses + admin_reply on tasks assigned to them
CREATE POLICY "Responder sees own and admin replies on assigned tasks"
  ON task_responses
  FOR SELECT
  TO authenticated
  USING (
    responder_user_id = auth.uid()
    OR (
      response_type = 'admin_reply'
      AND EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = task_responses.task_id
          AND t.assigned_user_id = auth.uid()
      )
    )
  );
