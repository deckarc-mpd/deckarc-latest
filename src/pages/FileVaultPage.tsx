import { useEffect, useState, useRef, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { uploadFile, insertProjectFile, getSignedUrl } from '../lib/fileUpload';
import {
  FolderOpen, Upload, Search, FileText, Image, CheckCircle,
  AlertTriangle, Archive, Download, X, Eye, ExternalLink, Loader,
} from 'lucide-react';

interface FileRecord {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_size_kb: number;
  document_category: string;
  custom_category_name: string;
  file_description: string;
  file_date: string;
  vendor_name: string;
  client_visible: boolean;
  client_visibility_status: string;
  uploaded_by_role: string;
  related_module: string;
  is_archived: boolean;
  uploaded_at: string;
  storage_path: string | null;
  project_name?: string;
  signedUrl?: string | null;
}

const DOCUMENT_CATEGORIES = [
  'Permit', 'Approved Plans', 'Architectural Plans', 'Engineering / Structural',
  'Inspection Report', 'Inspection Correction Notice', 'Receipt', 'Invoice',
  'Material Order', 'Change Order', 'Contract / Agreement', 'HOA / ARC Approval',
  'Client Selection', 'Client Approval', 'Before Photo', 'Progress Photo', 'After Photo',
  'Issue / Damage Photo', 'Warranty', 'Punch List', 'Closeout Document',
  'Permit Portal Screenshot', 'Inspection Portal Screenshot', 'Vendor / Supplier Document',
  'Insurance Document', 'Payment Document', 'Task Attachment', 'Daily Update Photo', 'Other',
];

const CLIENT_VISIBILITY_STATUSES = [
  'Internal Only', 'Pending Admin Approval', 'Approved for Client', 'Hidden from Client',
];

const visStatusColors: Record<string, string> = {
  'Internal Only': 'bg-concrete-100 text-concrete-600',
  'Pending Admin Approval': 'bg-amber-100 text-amber-700',
  'Approved for Client': 'bg-emerald-100 text-emerald-700',
  'Hidden from Client': 'bg-concrete-200 text-concrete-500',
};

function fileIcon(type: string) {
  if (['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'image'].some(e => (type || '').toLowerCase().includes(e))) {
    return <Image className="w-4 h-4 text-steel-400" />;
  }
  return <FileText className="w-4 h-4 text-steel-400" />;
}

export default function FileVaultPage() {
  const { profile } = useAuth();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; project_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterVisibility, setFilterVisibility] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Upload form
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [relatedModule, setRelatedModule] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [fileDate, setFileDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  const isClient = profile?.role === 'CLIENT';
  const isAdmin = profile?.role === 'DECKARC_ADMIN' || profile?.role === 'CONVAZANT_SUPER_ADMIN';

  useEffect(() => { load(); }, [profile?.id, showArchived]);

  async function load() {
    setLoading(true);
    const [filesRes, projRes] = await Promise.all([
      supabase.from('project_files').select('*').eq('is_deleted', false).eq('is_archived', showArchived).order('uploaded_at', { ascending: false }).limit(100),
      supabase.from('projects').select('id,project_name').eq('is_archived', false).order('project_name'),
    ]);

    const rawFiles = filesRes.data || [];
    const projs = projRes.data || [];
    setProjects(projs);

    const projMap = new Map(projs.map((p: any) => [p.id, p.project_name]));
    const visible = isClient
      ? rawFiles.filter((f: any) => f.client_visible && f.client_visibility_status === 'Approved for Client')
      : rawFiles;

    // Resolve signed URLs in parallel
    const enriched = await Promise.all(
      visible.map(async (f: any) => {
        const signedUrl = await getSignedUrl(f.storage_path || f.storage_path_or_placeholder);
        return {
          ...f,
          project_name: projMap.get(f.project_id) || '—',
          signedUrl,
        };
      })
    );

    setFiles(enriched);
    setLoading(false);
  }

  const filtered = files.filter(f => {
    const matchSearch = !search || f.file_name.toLowerCase().includes(search.toLowerCase()) || (f.document_category || '').toLowerCase().includes(search.toLowerCase()) || (f.vendor_name || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || f.document_category === filterCategory;
    const matchVis = !filterVisibility || f.client_visibility_status === filterVisibility;
    const matchProj = !filterProject || f.project_id === filterProject;
    return matchSearch && matchCat && matchVis && matchProj;
  });

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile) { setUploadError('Please select a file to upload.'); return; }
    if (!category) { setUploadError('Please select a document category.'); return; }
    if (!projectId) { setUploadError('Please select a project.'); return; }

    setSaving(true);
    setUploadError('');
    setUploadProgress('Uploading file...');

    try {
      const result = await uploadFile(selectedFile, projectId, profile?.organization_id ?? null);
      setUploadProgress('Saving record...');
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
        relatedModule: relatedModule || undefined,
        clientVisible: false,
      });

      setShowUpload(false);
      resetForm();
      setUploadProgress('');
      await load();
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed. Please try again.');
      setUploadProgress('');
    }
    setSaving(false);
  }

  function resetForm() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setCategory(''); setCustomCategory(''); setDescription('');
    setProjectId(''); setRelatedModule(''); setVendorName('');
    setFileDate(new Date().toISOString().split('T')[0]);
    setUploadError('');
  }

  async function approveForClient(id: string) {
    await supabase.from('project_files').update({
      client_visible: true,
      client_visibility_status: 'Approved for Client',
      approved_for_client_at: new Date().toISOString(),
      approved_for_client_by: profile?.id,
    }).eq('id', id);
    await load();
  }

  async function archiveFile(id: string) {
    await supabase.from('project_files').update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by_user_id: profile?.id,
    }).eq('id', id);
    await load();
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-steel-800 rounded-xl flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-concrete-900">Project File Vault</h1>
          </div>
          <p className="text-sm text-concrete-500 ml-12">
            Secure document center — permits, plans, photos, receipts, and project records.
          </p>
        </div>
        {!isClient && (
          <button onClick={() => setShowUpload(v => !v)} className="btn-primary flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" />
            Upload Document
          </button>
        )}
      </div>

      {/* Upload form */}
      {showUpload && !isClient && (
        <div className="bg-white border border-concrete-200 rounded-2xl shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-concrete-800">Upload Document</h2>
            <button onClick={() => { setShowUpload(false); resetForm(); }} className="text-concrete-400 hover:text-concrete-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            {/* File input */}
            <div>
              <label className="block text-xs font-semibold text-concrete-600 mb-1.5">File *</label>
              <div
                className="border-2 border-dashed border-concrete-200 rounded-xl p-5 text-center cursor-pointer hover:border-steel-400 hover:bg-concrete-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4 text-steel-500" />
                    <span className="text-sm font-medium text-concrete-800">{selectedFile.name}</span>
                    <span className="text-xs text-concrete-400">({Math.round(selectedFile.size / 1024)} KB)</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-concrete-400 mx-auto mb-1.5" />
                    <p className="text-sm text-concrete-500">Click to choose a file</p>
                    <p className="text-xs text-concrete-400 mt-1">PDF, images, docs — up to 50 MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-concrete-600 mb-1.5">Project *</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)} className="input-field text-sm" required>
                  <option value="">Select project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-concrete-600 mb-1.5">Document Category *</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="input-field text-sm" required>
                  <option value="">Select category...</option>
                  {DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {category === 'Other' && (
                <div>
                  <label className="block text-xs font-semibold text-concrete-600 mb-1.5">Custom Category Name</label>
                  <input value={customCategory} onChange={e => setCustomCategory(e.target.value)} className="input-field text-sm" placeholder="Describe the category" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-concrete-600 mb-1.5">Related Module</label>
                <select value={relatedModule} onChange={e => setRelatedModule(e.target.value)} className="input-field text-sm">
                  <option value="">— None —</option>
                  {['Permit', 'Inspection', 'Daily Update', 'Change Order', 'Payment', 'Material', 'Punch List', 'Warranty', 'Closeout', 'HOA', 'Client Selection', 'Task'].map(m => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-concrete-600 mb-1.5">File Date</label>
                <input type="date" value={fileDate} onChange={e => setFileDate(e.target.value)} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-concrete-600 mb-1.5">Vendor / Supplier</label>
                <input value={vendorName} onChange={e => setVendorName(e.target.value)} className="input-field text-sm" placeholder="Vendor name (optional)" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-concrete-600 mb-1.5">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="input-field text-sm w-full resize-none" placeholder="Brief description of this document" />
            </div>

            {uploadProgress && (
              <div className="flex items-center gap-2 text-steel-600 text-sm">
                <Loader className="w-4 h-4 animate-spin" />
                {uploadProgress}
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-2 bg-hazard-50 border border-hazard-200 text-hazard-700 text-sm rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {uploadError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowUpload(false); resetForm(); }} className="px-4 py-2 text-sm text-concrete-500 hover:text-concrete-800 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2">
                {saving ? 'Uploading...' : 'Upload Document'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-concrete-200 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-concrete-400 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="flex-1 text-sm outline-none text-concrete-700 placeholder-concrete-400" placeholder="Search files..." />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="text-xs border border-concrete-200 rounded-lg px-2.5 py-1.5 text-concrete-600 bg-white">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="text-xs border border-concrete-200 rounded-lg px-2.5 py-1.5 text-concrete-600 bg-white">
            <option value="">All Categories</option>
            {DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          {!isClient && (
            <select value={filterVisibility} onChange={e => setFilterVisibility(e.target.value)} className="text-xs border border-concrete-200 rounded-lg px-2.5 py-1.5 text-concrete-600 bg-white">
              <option value="">All Visibility</option>
              {CLIENT_VISIBILITY_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          )}
          {isAdmin && (
            <button onClick={() => setShowArchived(v => !v)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${showArchived ? 'bg-concrete-200 text-concrete-700' : 'bg-concrete-100 text-concrete-500 hover:bg-concrete-200'}`}>
              {showArchived ? 'Hide Archived' : 'Show Archived'}
            </button>
          )}
        </div>
        <span className="text-xs text-concrete-400 font-medium">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* File list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-concrete-200 rounded-xl p-4 animate-pulse flex gap-4">
              <div className="w-8 h-8 bg-concrete-200 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-concrete-200 rounded w-1/3" />
                <div className="h-3 bg-concrete-100 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-10 h-10 text-concrete-300 mx-auto mb-3" />
          <p className="text-sm text-concrete-500 font-medium">No documents found.</p>
          {!isClient && <p className="text-xs text-concrete-400 mt-1">Click "Upload Document" to add a file.</p>}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">File</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  {!isClient && <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Visibility</th>}
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(file => (
                  <tr key={file.id} className="hover:bg-slate-50 transition-colors duration-100 group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          {fileIcon(file.file_type)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 leading-tight">{file.file_name}</p>
                          {file.file_description && <p className="text-xs text-slate-400 truncate max-w-[200px]">{file.file_description}</p>}
                          {file.vendor_name && <p className="text-xs text-slate-400">{file.vendor_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                        {file.document_category === 'Other' && file.custom_category_name ? file.custom_category_name : file.document_category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">{file.project_name}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {file.file_date ? new Date(file.file_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    {!isClient && (
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${visStatusColors[file.client_visibility_status] || 'bg-slate-100 text-slate-500'}`}>
                          {file.client_visibility_status}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        {file.signedUrl ? (
                          <>
                            <a
                              href={file.signedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View file"
                              className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                            <a
                              href={file.signedUrl}
                              download={file.file_name}
                              title="Download file"
                              className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </>
                        ) : (
                          <span className="text-xs text-concrete-300 italic">No file</span>
                        )}
                        {isAdmin && (
                          <>
                            {file.client_visibility_status === 'Internal Only' && (
                              <button onClick={() => approveForClient(file.id)} title="Approve for Client" className="p-1.5 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!file.is_archived && (
                              <button onClick={() => archiveFile(file.id)} title="Archive" className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-concrete-400 text-center">
        Files are internal by default. Admin must approve before client can see any document.
      </p>
    </div>
  );
}
