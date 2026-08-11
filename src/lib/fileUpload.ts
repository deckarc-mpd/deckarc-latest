import { supabase } from './supabase';

export const BUCKET = 'project-files';

export const PHOTO_CATEGORIES = [
  'Progress Photo',
  'Before Photo',
  'After Photo',
  'Issue / Damage Photo',
  'Inspection Report',
  'Punch List',
  'Material Order',
  'Daily Update Photo',
] as const;

export type PhotoCategory = typeof PHOTO_CATEGORIES[number];

export function isPhotoCategory(cat: string): boolean {
  return PHOTO_CATEGORIES.includes(cat as PhotoCategory);
}

export function isImageType(fileType: string): boolean {
  const t = (fileType || '').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'].some(e => t.includes(e));
}

export interface UploadResult {
  storagePath: string;
  publicUrl: string;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
}

/**
 * Upload a file to Supabase Storage.
 * Path format: {orgId}/{projectId}/{timestamp}_{sanitizedFilename}
 * Falls back to {projectId}/{timestamp}_{sanitizedFilename} if orgId is null.
 * This path format is required for storage RLS policies to enforce project-level access.
 */
export async function uploadFile(
  file: File,
  projectId: string,
  organizationId: string | null,
): Promise<UploadResult> {
  const ext = file.name.split('.').pop() || '';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = organizationId ? `${organizationId}/${projectId}` : projectId;
  const path = `${prefix}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) throw new Error(error.message);

  const { data: signedData, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7-day signed URL for upload confirmation

  if (signErr || !signedData) throw new Error(signErr?.message || 'Could not get file URL');

  return {
    storagePath: path,
    publicUrl: signedData.signedUrl,
    fileName: file.name,
    fileType: ext.toLowerCase(),
    fileSizeKb: Math.round(file.size / 1024),
  };
}

/**
 * Get a 2-hour signed URL for a stored file path.
 * Returns null for placeholders, missing paths, or storage errors.
 * Returns the value as-is for legacy http:// URLs (migrated records).
 */
export async function getSignedUrl(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath || storagePath.startsWith('[PLACEHOLDER')) return null;
  // Legacy migrated records stored the original photo URL directly
  if (storagePath.startsWith('http')) return storagePath;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 2); // 2-hour URL

  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Insert a record into project_files after a successful upload.
 * All files are created as internal-only by default.
 * Admin must explicitly approve before client can see any file.
 */
export async function insertProjectFile(opts: {
  projectId: string;
  uploadedByUserId: string;
  uploadedByRole: string;
  organizationId: string | null;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
  storagePath: string;
  documentCategory: string;
  fileDescription?: string;
  relatedModule?: string;
  relatedRecordId?: string | null;
  clientVisible?: boolean;
}): Promise<{ id: string } | null> {
  const { data, error } = await supabase.from('project_files').insert({
    project_id: opts.projectId,
    organization_id: opts.organizationId,
    uploaded_by_user_id: opts.uploadedByUserId,
    uploaded_by_role: opts.uploadedByRole,
    file_name: opts.fileName,
    file_type: opts.fileType,
    file_size_kb: opts.fileSizeKb,
    document_category: opts.documentCategory,
    file_description: opts.fileDescription || '',
    related_module: opts.relatedModule || null,
    related_record_id: opts.relatedRecordId || null,
    storage_path: opts.storagePath,
    storage_path_or_placeholder: opts.storagePath,
    client_visible: opts.clientVisible ?? false,
    internal_only: true,
    client_visibility_status: 'Internal Only',
    is_deleted: false,
    is_archived: false,
  }).select('id').single();

  if (error) return null;
  return data;
}
