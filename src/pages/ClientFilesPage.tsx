import { useEffect, useState } from 'react';
import { Image, FileText, FolderOpen, Download, Eye, Search, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getSignedUrl } from '../lib/fileUpload';

type FileCategory = 'All' | 'Photo' | 'Permit' | 'Plan' | 'Receipt' | 'Warranty' | 'Contract' | 'Inspection' | 'Other';
const CATEGORIES: FileCategory[] = ['All', 'Photo', 'Permit', 'Plan', 'Receipt', 'Warranty', 'Contract', 'Inspection', 'Other'];

const PHOTO_CATS = new Set(['Before Photo', 'Progress Photo', 'After Photo', 'Issue / Damage Photo', 'Daily Update Photo']);

interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  document_category: string;
  file_description: string;
  file_date: string | null;
  uploaded_at: string;
  storage_path: string | null;
  storage_path_or_placeholder: string | null;
  signedUrl?: string | null;
  project?: { project_name: string };
}

function fmtDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isImage(fileType: string) {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes((fileType || '').toLowerCase());
}

function mapToUiCategory(doc_category: string): FileCategory {
  if (PHOTO_CATS.has(doc_category)) return 'Photo';
  if (['Permit', 'HOA / ARC Approval', 'Permit Portal Screenshot'].includes(doc_category)) return 'Permit';
  if (['Approved Plans', 'Architectural Plans', 'Engineering / Structural'].includes(doc_category)) return 'Plan';
  if (['Receipt', 'Invoice', 'Payment Document'].includes(doc_category)) return 'Receipt';
  if (doc_category === 'Warranty') return 'Warranty';
  if (['Contract / Agreement', 'Client Selection', 'Client Approval'].includes(doc_category)) return 'Contract';
  if (['Inspection Report', 'Inspection Correction Notice', 'Inspection Portal Screenshot'].includes(doc_category)) return 'Inspection';
  return 'Other';
}

export default function ClientFilesPage() {
  const { profile } = useAuth();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<FileCategory>('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profile) return;
    load();
  }, [profile]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('project_files')
      .select('id, project_id, file_name, file_type, document_category, file_description, file_date, uploaded_at, storage_path, storage_path_or_placeholder, projects(project_name)')
      .eq('client_visible', true)
      .eq('client_visibility_status', 'Approved for Client')
      .eq('is_deleted', false)
      .order('uploaded_at', { ascending: false });

    if (!error) {
      const enriched = await Promise.all(
        (data || []).map(async (f: any) => {
          const storagePath = f.storage_path || f.storage_path_or_placeholder;
          const signedUrl = await getSignedUrl(storagePath);
          return { ...f, project: f.projects, signedUrl };
        })
      );
      setFiles(enriched);
    }
    setLoading(false);
  }

  const filtered = files.filter(f => {
    const uiCat = mapToUiCategory(f.document_category || 'Other');
    const matchCat = activeCategory === 'All' || uiCat === activeCategory;
    const q = search.trim().toLowerCase();
    const matchQ = !q ||
      f.file_name.toLowerCase().includes(q) ||
      (f.file_description || '').toLowerCase().includes(q) ||
      (f.project?.project_name || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = cat === 'All'
      ? files.length
      : files.filter(f => mapToUiCategory(f.document_category || 'Other') === cat).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 h-14 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-steel-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <Image className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">Files &amp; Photos</span>
          {!loading && files.length > 0 && (
            <span className="ml-1 text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
              {files.length}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-6 space-y-4">

        {/* Search + category filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-8 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-400 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CATEGORIES.filter(c => categoryCounts[c] > 0 || c === 'All').map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                  activeCategory === cat
                    ? 'bg-steel-800 text-white border-steel-800'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}
              >
                {cat}
                {categoryCounts[cat] > 0 && (
                  <span className={`ml-1.5 text-[10px] ${activeCategory === cat ? 'opacity-70' : 'text-slate-400'}`}>
                    {categoryCounts[cat]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Files table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
              <Loader className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading files...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-5">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center mb-3">
                <FolderOpen className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-700">
                {files.length === 0 ? 'No files shared yet' : 'No files match your search'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {files.length === 0
                  ? 'Your DECKARC team will share approved documents and photos here.'
                  : 'Try adjusting your search or filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="pl-5 pr-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">File Name</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">Category</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Date</th>
                    <th className="pl-3 pr-5 py-2.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(f => {
                    const img = isImage(f.file_type);
                    return (
                      <tr key={f.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors group">
                        <td className="pl-5 pr-3 py-3.5 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-slate-200 transition-colors">
                              {img
                                ? <Image className="w-4 h-4 text-slate-400" />
                                : <FileText className="w-4 h-4 text-slate-400" />}
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-slate-700 truncate block max-w-[180px]">{f.file_name}</span>
                              {f.project?.project_name && (
                                <span className="text-[10px] text-slate-400 truncate block">{f.project.project_name}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 align-middle whitespace-nowrap hidden sm:table-cell">
                          <span className="text-xs text-slate-500">{f.document_category || 'Other'}</span>
                        </td>
                        <td className="px-3 py-3.5 align-middle whitespace-nowrap">
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded tracking-wide uppercase">
                            {f.file_type || 'file'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 align-middle whitespace-nowrap hidden sm:table-cell">
                          <span className="text-xs text-slate-400">{fmtDate(f.file_date || f.uploaded_at)}</span>
                        </td>
                        <td className="pl-3 pr-5 py-3.5 align-middle text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {f.signedUrl ? (
                              <>
                                <a
                                  href={f.signedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                                  title="View file"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </a>
                                <a
                                  href={f.signedUrl}
                                  download={f.file_name}
                                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                                  title="Download file"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </>
                            ) : (
                              <span className="text-xs text-slate-300 italic">Unavailable</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 pb-2">
          Only files approved by your DECKARC coordinator appear here.
        </p>
      </div>
    </div>
  );
}
