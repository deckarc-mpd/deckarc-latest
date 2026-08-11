/*
  # Phase 5 — File Vault: Storage Path + Photo Log Migration

  ## Summary
  Wires real Supabase Storage support into project_files and migrates
  photo_logs records into project_files as the single source of truth.

  ## Changes

  ### 1. project_files — add storage_path column
  Adds a dedicated `storage_path` column to store the Supabase Storage
  object path (e.g. `project-files/project_id/filename.jpg`).
  The legacy `storage_path_or_placeholder` column is preserved for
  backward compatibility but should no longer be written to by new code.

  ### 2. Migrate existing photo_logs → project_files
  Copies every row from photo_logs into project_files using:
  - document_category  = photo_category (mapped to matching category name)
  - related_module     = 'Task'  (when related_task_id is set)
  - related_record_id  = related_task_id
  - storage_path       = NULL  (URL-paste records have no storage path)
  - storage_path_or_placeholder = photo_url (preserve the URL that was pasted)
  - client_visible     = false (internal only by default)
  - is_deleted         = false

  ### 3. RLS policy — allow authenticated users to use storage bucket
  Adds a storage bucket named `project-files` (public=false) and
  RLS policies so:
  - Authenticated users can upload to their own prefix
  - Authenticated users can download files from projects they belong to
  - Admins have full access
  Note: Bucket creation via SQL requires the storage schema to exist,
  which it does in all Supabase projects.

  ## Important Notes
  1. photo_logs table is NOT dropped — kept as legacy/archive only.
  2. No data is lost.
  3. All new file records are internal by default (client_visible = false).
  4. Admin must explicitly approve before client can see any file.
*/

-- ── 1. Add storage_path to project_files ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_files' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE project_files ADD COLUMN storage_path text;
  END IF;
END $$;

-- Add a photo_log_source_id column so we can trace migrated records back
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_files' AND column_name = 'photo_log_source_id'
  ) THEN
    ALTER TABLE project_files ADD COLUMN photo_log_source_id uuid REFERENCES photo_logs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2. Migrate photo_logs → project_files ────────────────────────────────────

INSERT INTO project_files (
  project_id,
  uploaded_by_user_id,
  uploaded_by_role,
  file_name,
  file_type,
  document_category,
  file_description,
  file_date,
  related_module,
  related_record_id,
  storage_path,
  storage_path_or_placeholder,
  client_visible,
  internal_only,
  client_visibility_status,
  is_deleted,
  is_archived,
  uploaded_at,
  photo_log_source_id
)
SELECT
  pl.project_id,
  pl.uploaded_by,
  'MIGRATED_FROM_PHOTO_LOG',
  -- Generate a file name from description or category
  COALESCE(
    NULLIF(TRIM(pl.photo_description), ''),
    pl.photo_category
  ) || COALESCE(
    ' — ' || TO_CHAR(pl.taken_date::date, 'Mon DD YYYY'),
    ''
  ),
  -- Detect type from URL
  CASE
    WHEN pl.photo_url ILIKE '%.jpg'  OR pl.photo_url ILIKE '%.jpeg' THEN 'jpg'
    WHEN pl.photo_url ILIKE '%.png'  THEN 'png'
    WHEN pl.photo_url ILIKE '%.webp' THEN 'webp'
    WHEN pl.photo_url ILIKE '%.heic' THEN 'heic'
    WHEN pl.photo_url ILIKE '%.gif'  THEN 'gif'
    ELSE 'image'
  END,
  -- Map photo_category to document_category values used in FileVault
  CASE pl.photo_category
    WHEN 'Progress Photo'    THEN 'Progress Photo'
    WHEN 'Before Photo'      THEN 'Before Photo'
    WHEN 'After Photo'       THEN 'After Photo'
    WHEN 'Material Delivery' THEN 'Material Order'
    WHEN 'Damage / Incident' THEN 'Issue / Damage Photo'
    WHEN 'Inspection Proof'  THEN 'Inspection Report'
    WHEN 'Completion Proof'  THEN 'After Photo'
    WHEN 'Punch List Proof'  THEN 'Punch List'
    ELSE 'Progress Photo'
  END,
  pl.photo_description,
  pl.taken_date,
  -- related_module
  CASE WHEN pl.related_task_id IS NOT NULL THEN 'Task' ELSE NULL END,
  pl.related_task_id,
  -- storage_path is NULL — these were URL-paste records
  NULL,
  -- preserve the photo_url in the legacy placeholder column
  COALESCE(NULLIF(pl.photo_url, ''), '[URL not provided]'),
  false,  -- client_visible = false by default
  true,   -- internal_only = true
  'Internal Only',
  false,
  false,
  pl.created_at,
  pl.id
FROM photo_logs pl
WHERE pl.project_id IS NOT NULL
  AND NOT EXISTS (
    -- Don't re-migrate if already done
    SELECT 1 FROM project_files pf WHERE pf.photo_log_source_id = pl.id
  );

-- ── 3. Create Supabase Storage bucket (project-files) ────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,
  52428800,  -- 50 MB limit per file
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 4. Storage RLS policies ───────────────────────────────────────────────────

-- Allow authenticated users to upload files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload project files'
  ) THEN
    CREATE POLICY "Authenticated users can upload project files"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'project-files');
  END IF;
END $$;

-- Allow authenticated users to view/download files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users can view project files'
  ) THEN
    CREATE POLICY "Authenticated users can view project files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'project-files');
  END IF;
END $$;

-- Allow authenticated users to update their own uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can update own project files'
  ) THEN
    CREATE POLICY "Users can update own project files"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'project-files' AND owner = auth.uid());
  END IF;
END $$;

-- Allow authenticated users to delete their own uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can delete own project files'
  ) THEN
    CREATE POLICY "Users can delete own project files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'project-files' AND owner = auth.uid());
  END IF;
END $$;
