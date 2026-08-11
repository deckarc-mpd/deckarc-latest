import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { uploadFile, insertProjectFile, getSignedUrl, PHOTO_CATEGORIES } from '../../lib/fileUpload';
import { Plus, Camera, Image, Upload, Loader, X } from 'lucide-react';

interface PhotoFile {
  id: string;
  file_name: string;
  document_category: string;
  file_description: string;
  file_date: string | null;
  uploaded_at: string;
  storage_path: string | null;
  related_record_id: string | null;
  signedUrl?: string | null;
}

const catColors: Record<string, string> = {
  'Progress Photo': 'text-steel-700 bg-steel-100',
  'Before Photo': 'text-concrete-600 bg-concrete-100',
  'After Photo': 'text-site-700 bg-site-100',
  'Issue / Damage Photo': 'text-hazard-700 bg-hazard-100',
  'Inspection Report': 'text-steel-700 bg-steel-100',
  'Punch List': 'text-amber-700 bg-amber-100',
  'Material Order': 'text-amber-700 bg-amber-100',
  'Daily Update Photo': 'text-steel-600 bg-steel-50',
};

export default function PhotoLogTab({ projectId }: { projectId: string }) {
  const { profile } = useAuth();
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [filterCat, setFilterCat] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>(PHOTO_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [photoDate, setPhotoDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('project_files')
      .select('id, file_name, document_category, file_description, file_date, uploaded_at, storage_path, related_record_id')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .in('document_category', [...PHOTO_CATEGORIES])
      .order('uploaded_at', { ascending: false });

    const enriched = await Promise.all(
      (data || []).map(async (f: any) => {
        const signedUrl = await getSignedUrl(f.storage_path);
        return { ...f, signedUrl };
      })
    );
    setPhotos(enriched);
    setLoading(false);
  }

  async function handleUpload() {
    if (!selectedFile) { setUploadError('Please select a photo file.'); return; }
    setSaving(true);
    setUploadError('');
    try {
      const result = await uploadFile(selectedFile, projectId, profile?.organization_id ?? null);
      await insertProjectFile({
        projectId,
        uploadedByUserId: profile!.id,
        uploadedByRole: profile!.role,
        organizationId: profile?.organization_id ?? null,
        fileName: result.fileName,
        fileType: result.fileType,
        fileSizeKb: result.fileSizeKb,
        storagePath: result.storagePath,
        documentCategory: category,
        fileDescription: description,
        relatedModule: 'Photo Log',
        clientVisible: false,
      });
      setShowUpload(false);
      resetForm();
      await load();
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed. Please try again.');
    }
    setSaving(false);
  }

  function resetForm() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setCategory(PHOTO_CATEGORIES[0]);
    setDescription('');
    setPhotoDate(new Date().toISOString().split('T')[0]);
    setUploadError('');
  }

  const filtered = filterCat ? photos.filter(p => p.document_category === filterCat) : photos;

  if (loading) return <div className="text-center py-12 text-concrete-400 text-sm">Loading photos...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-concrete-700">{photos.length} photo{photos.length !== 1 ? 's' : ''}</h3>
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            className="text-xs border border-concrete-200 rounded-lg px-2.5 py-1.5 text-concrete-600 bg-white"
          >
            <option value="">All Categories</option>
            {PHOTO_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={() => setShowUpload(v => !v)} className="btn-primary">
          <Upload className="w-4 h-4" /> Upload Photo
        </button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="bg-white border border-concrete-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-concrete-800">Upload Photo</span>
            <button onClick={() => { setShowUpload(false); resetForm(); }} className="text-concrete-400 hover:text-concrete-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className="border-2 border-dashed border-concrete-200 rounded-xl p-4 text-center cursor-pointer hover:border-steel-400 hover:bg-concrete-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <Camera className="w-4 h-4 text-steel-500" />
                <span className="text-sm font-medium text-concrete-800">{selectedFile.name}</span>
                <span className="text-xs text-concrete-400">({Math.round(selectedFile.size / 1024)} KB)</span>
              </div>
            ) : (
              <>
                <Camera className="w-5 h-5 text-concrete-400 mx-auto mb-1" />
                <p className="text-sm text-concrete-500">Click to choose a photo</p>
                <p className="text-xs text-concrete-400 mt-0.5">JPG, PNG, HEIC, WEBP</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-sm">Category</label>
              <select className="input-field text-sm" value={category} onChange={e => setCategory(e.target.value)}>
                {PHOTO_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label-sm">Date Taken</label>
              <input type="date" className="input-field text-sm" value={photoDate} onChange={e => setPhotoDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-sm">Description</label>
            <input className="input-field text-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of this photo" />
          </div>

          {uploadError && (
            <p className="text-xs text-hazard-600 bg-hazard-50 border border-hazard-200 rounded-lg px-3 py-2">{uploadError}</p>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowUpload(false); resetForm(); }} className="btn-ghost text-sm">Cancel</button>
            <button onClick={handleUpload} disabled={saving || !selectedFile} className="btn-primary text-sm disabled:opacity-50">
              {saving ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Uploading...</> : <><Upload className="w-3.5 h-3.5" /> Upload</>}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-concrete-400 text-sm">
          <Camera className="w-10 h-10 mx-auto mb-2 text-concrete-300" />
          {filterCat ? `No ${filterCat} photos yet.` : 'No photos uploaded yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(p => (
            <div key={p.id} className="card p-4">
              {p.signedUrl ? (
                <a href={p.signedUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-32 bg-concrete-100 rounded-lg mb-3 overflow-hidden">
                  <img src={p.signedUrl} alt={p.file_description} className="w-full h-full object-cover hover:opacity-90 transition-opacity" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </a>
              ) : (
                <div className="w-full h-24 bg-concrete-100 rounded-lg mb-3 flex items-center justify-center">
                  <Image className="w-8 h-8 text-concrete-300" />
                </div>
              )}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColors[p.document_category] || 'text-concrete-600 bg-concrete-100'}`}>
                  {p.document_category}
                </span>
                <span className="text-xs text-concrete-400">
                  {new Date((p.file_date || p.uploaded_at) + (p.file_date ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              {p.file_description && <p className="text-sm font-medium text-concrete-800 truncate">{p.file_description}</p>}
              <p className="text-xs text-concrete-400 truncate mt-0.5">{p.file_name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
