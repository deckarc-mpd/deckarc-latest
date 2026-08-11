/*
  # Enhance tasks table for Role-Based Task Assignment (Priority 7)

  ## Summary
  Adds the fields needed for role-safe task creation and assignment without
  replacing or duplicating the existing tasks table. All changes are additive
  and backward-compatible. Existing rows are unaffected.

  ## New Columns

  ### Classification
  - `task_type` (text, default 'Project Task') — one of the defined task types
    (Project Task, Field Task, Client Request, Subcontractor Request, GC Task,
    Inspection Task, Permit Task, Material Task, File/Document Request,
    Change Request, Issue / Blocker, Follow-Up, Internal Admin Task,
    Platform Support Task)
  - `priority` (text, default 'Medium') — High / Medium / Low

  ### Authorship / Assignment
  - `created_by_user_id` (uuid → user_profiles) — who created the task
  - `created_by_role` (text) — role snapshot at creation time (denormalized for
    audit; avoids joins on every read)

  ### Blocker / Request
  - `blocker_reason` already exists as `blocked_reason` — no duplicate added

  ## Status Extension Note
  The existing `status` column (text, NOT NULL, default 'Not Started') already
  supports any value. The application now uses an extended status set:
    Draft | Needs Review | Open | Assigned | In Progress | Blocked |
    Ready for Review | Completed | Closed | Cancelled
  Old values (Not Started, Waiting, Delayed) remain valid for existing rows;
  the UI maps them to the closest new display value.

  ## RLS
  - No new RLS policies required. Existing task RLS already covers:
    - Admin/GC: full read/write
    - Sub: assigned_user_id = auth.uid() or is_client_visible + project membership
    - Client: is_client_visible rows only
  - `created_by_user_id` follows the same RLS path as `assigned_user_id`.

  ## Security
  - Passwords: untouched.
  - No sensitive profile data added to tasks table.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'task_type'
  ) THEN
    ALTER TABLE tasks ADD COLUMN task_type text NOT NULL DEFAULT 'Project Task';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'priority'
  ) THEN
    ALTER TABLE tasks ADD COLUMN priority text NOT NULL DEFAULT 'Medium';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN created_by_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'created_by_role'
  ) THEN
    ALTER TABLE tasks ADD COLUMN created_by_role text NOT NULL DEFAULT '';
  END IF;
END $$;
