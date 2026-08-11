import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FolderOpen, Calendar, MapPin, ChevronRight, Search } from 'lucide-react';

interface ClientProject {
  id: string;
  project_name: string;
  project_type: string | null;
  status: string;
  progress_percentage: number;
  expected_finish_date: string | null;
  projected_finish_date: string | null;
  city: string | null;
  state: string | null;
  client_visible_notes: string | null;
}

const statusStyle = (s: string) => {
  if (s === 'Delayed')     return 'bg-amber-100 text-amber-700';
  if (s === 'In Progress') return 'bg-steel-100 text-steel-700';
  if (s === 'Completed')   return 'bg-emerald-100 text-emerald-700';
  if (s === 'Planning')    return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-600';
};

const barColor = (s: string) => {
  if (s === 'Delayed')   return 'bg-amber-400';
  if (s === 'Completed') return 'bg-emerald-500';
  return 'bg-steel-500';
};

function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClientProjectsPage({ onViewProject }: { onViewProject: (id: string) => void }) {
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('id, project_name, project_type, status, progress_percentage, expected_finish_date, projected_finish_date, city, state, client_visible_notes')
      .eq('is_archived', false)
      .order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  }

  const filtered = projects.filter(p =>
    !search.trim() ||
    p.project_name.toLowerCase().includes(search.toLowerCase()) ||
    p.project_type?.toLowerCase().includes(search.toLowerCase()) ||
    p.city?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 h-14 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-steel-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">My Projects</span>
          {!loading && (
            <span className="ml-1 text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
              {projects.length}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-6 space-y-4">
        {/* Search */}
        {projects.length > 1 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-8 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-400 transition-colors"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading your projects...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
              <FolderOpen className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {search ? 'No projects match your search' : 'No projects yet'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Your DECKARC team will set up your project details here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => {
              const finishDate = p.projected_finish_date || p.expected_finish_date;
              const isDelayed = p.projected_finish_date && p.expected_finish_date && p.projected_finish_date !== p.expected_finish_date;
              return (
                <button
                  key={p.id}
                  onClick={() => onViewProject(p.id)}
                  className="w-full bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all p-5 text-left group"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-slate-900 group-hover:text-steel-700 transition-colors truncate">
                        {p.project_name}
                      </p>
                      {p.project_type && (
                        <p className="text-xs text-slate-400 mt-0.5">{p.project_type}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${statusStyle(p.status)}`}>
                        {p.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-steel-500 transition-colors" />
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                      <span>Overall Progress</span>
                      <span className="font-semibold text-slate-600">{p.progress_percentage}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor(p.status)}`}
                        style={{ width: `${p.progress_percentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-4 flex-wrap text-xs text-slate-400">
                    {(p.city || p.state) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {p.city}{p.city && p.state ? ', ' : ''}{p.state}
                      </span>
                    )}
                    {finishDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {isDelayed ? (
                          <>
                            <span className="line-through mr-1">{fmtDate(p.expected_finish_date)}</span>
                            <span className="text-amber-600 font-semibold">{fmtDate(p.projected_finish_date)}</span>
                          </>
                        ) : (
                          <span>Est. {fmtDate(finishDate)}</span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Client notes */}
                  {p.client_visible_notes && (
                    <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                      {p.client_visible_notes}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
