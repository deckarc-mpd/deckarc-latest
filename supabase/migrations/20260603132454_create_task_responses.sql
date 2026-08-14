/*
  # Create task_responses table

  ## Purpose
  Allows subcontractors (and other assignees) to submit a text response to
  tasks assigned to them by an admin/GC (e.g. "Provide framing material list").
  Admin/GC can then review the response directly inside the task detail.

  ## New Table
  - `task_responses`
    - `id` (uuid, primary key)
    - `task_id` (uuid, FK → tasks)
    - `project_id` (uuid, FK → projects — stored for RLS convenience)
    - `responder_user_id` (uuid, FK → user_profiles)
    - `response_text` (text, required)
    - `attachment_url` (text, nullable — for future file attachment)
    - `visibility` (text, default 'internal' — never client-visible)
    - `status` (text, default 'submitted')
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Admin/GC SELECT: see all responses on their org's projects
  - Subcontractor SELECT: see only their own responses
  - INSERT: only project members may insert for their own user_id
*/

CREATE TABLE IF NOT EXISTS task_responses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id            uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  responder_user_id  uuid NOT NULL REFERENCES user_profiles(id),
  response_text      text NOT NULL,
  attachment_url     text,
  visibility         text NOT NULL DEFAULT 'internal',
  status             text NOT NULL DEFAULT 'submitted',
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_responses ENABLE ROW LEVEL SECURITY;

-- Admin and GC can view all responses
CREATE POLICY "Admin and GC can view all task responses"
  ON task_responses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('DECKARC_ADMIN', 'CONVAZANT_SUPER_ADMIN', 'GENERAL_CONTRACTOR')
    )
  );

-- Subcontractor can view their own responses only
CREATE POLICY "Responder can view own responses"
  ON task_responses
  FOR SELECT
  TO authenticated
  USING (responder_user_id = auth.uid());

-- Any project member may insert a response attributed to themselves
CREATE POLICY "Project members can insert own responses"
  ON task_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    responder_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM project_users
      WHERE project_users.project_id = task_responses.project_id
        AND project_users.user_id = auth.uid()
    )
  );

-- Index for fast lookups by task
CREATE INDEX IF NOT EXISTS idx_task_responses_task_id ON task_responses(task_id);
CREATE INDEX IF NOT EXISTS idx_task_responses_responder ON task_responses(responder_user_id);
