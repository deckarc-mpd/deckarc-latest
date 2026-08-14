import { useEffect, useState } from 'react';
import { supabase, Project } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Users, Printer, Download, BarChart2, ClipboardList, Activity } from 'lucide-react';

const REPORT_TYPES = [
  { id: 'progress', label: 'Project Progress Report', icon: BarChart2, desc: 'Tasks, milestones, and overall status' },
  { id: 'delay', label: 'Delay Report', icon: ClipboardList, desc: 'All delays, reasons, and schedule impacts' },
  { id: 'punchlist', label: 'Punch List Report', icon: FileText, desc: 'Open punch list and warranty items' },
  { id: 'client', label: 'Client Update', icon: Users, desc: 'Professional client-facing update' },
  { id: 'activity', label: 'Activity Log Report', icon: Activity, desc: 'Audit trail of all project changes' },
];

export default function ReportsPage({ onViewProject }: { onViewProject: (id: string) => void }) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('projects').select('*').order('project_name').then(({ data }) => {
      setProjects(data || []);
      setLoading(false);
    });
  }, []);

  async function printReport(reportType: string, project: Project) {
    setPrinting(reportType);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let reportTitle = '';
    let reportLines: string[] = [];

    if (reportType === 'progress') {
      reportTitle = `Project Progress Report — ${project.project_name}`;
      const { data: tasks } = await supabase.from('tasks').select('*').eq('project_id', project.id);
      const all = tasks || [];
      const done = all.filter((t: any) => t.status === 'Completed');
      const inProg = all.filter((t: any) => t.status === 'In Progress');
      const nowStr = new Date().toISOString().split('T')[0];
      const overdue = all.filter((t: any) => t.status !== 'Completed' && t.planned_finish_date && t.planned_finish_date < nowStr);
      reportLines = [
        `Project: ${project.project_name}`,
        `Client: ${project.client_name}`,
        `Status: ${project.status} | Progress: ${project.progress_percentage}%`,
        `Report Date: ${today}`,
        '',
        `TASKS: ${done.length}/${all.length} completed`,
        ...inProg.map((t: any) => `  In Progress: ${t.task_name} — ${t.progress_percentage}%`),
        ...overdue.map((t: any) => `  OVERDUE: ${t.task_name} (due ${t.planned_finish_date})`),
        '',
        `Expected Finish: ${project.expected_finish_date || 'TBD'}`,
        `Projected Finish: ${project.projected_finish_date || project.expected_finish_date || 'TBD'}`,
      ];
    } else if (reportType === 'delay') {
      reportTitle = `Delay Report — ${project.project_name}`;
      const [{ data: log }, { data: tasks }] = await Promise.all([
        supabase.from('schedule_change_log').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
        supabase.from('tasks').select('task_name,delay_days,delay_reason,delay_source').eq('project_id', project.id).gt('delay_days', 0),
      ]);
      reportLines = [
        `Project: ${project.project_name}`,
        `Report Date: ${today}`,
        '',
        `DELAYED TASKS (${(tasks || []).length}):`,
        ...(tasks || []).map((t: any) => `  - ${t.task_name}: +${t.delay_days}d — ${t.delay_reason || 'No reason'} (${t.delay_source || 'Unknown'})`),
        '',
        `SCHEDULE CHANGE LOG (${(log || []).length} entries):`,
        ...(log || []).slice(0, 20).map((l: any) => `  ${new Date(l.created_at).toLocaleDateString()}: ${l.change_type} — ${l.reason || 'No reason'}`),
      ];
    } else if (reportType === 'punchlist') {
      reportTitle = `Punch List Report — ${project.project_name}`;
      const { data: items } = await supabase.from('punch_list_items').select('*').eq('project_id', project.id);
      const open = (items || []).filter((i: any) => !['Complete', 'Closed'].includes(i.status));
      const closed = (items || []).filter((i: any) => ['Complete', 'Closed'].includes(i.status));
      reportLines = [
        `Project: ${project.project_name}`,
        `Report Date: ${today}`,
        '',
        `OPEN ITEMS (${open.length}):`,
        ...open.map((i: any) => `  - [${i.item_type}] ${i.item_title} — ${i.status} | Responsible: ${i.responsible_party || 'TBD'}`),
        '',
        `COMPLETED ITEMS (${closed.length}):`,
        ...closed.map((i: any) => `  - ${i.item_title}`),
      ];
    } else if (reportType === 'client') {
      reportTitle = `Client Update — ${project.project_name}`;
      reportLines = [
        `PROJECT UPDATE — ${project.project_name}`,
        `For: ${project.client_name}`,
        `Date: ${today}`,
        '',
        `Your project is currently ${project.progress_percentage}% complete.`,
        `Status: ${project.status}`,
        project.projected_finish_date ? `Projected completion: ${new Date(project.projected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : '',
        '',
        project.client_visible_notes || 'No current notes from the project team.',
        '',
        'Thank you for your continued trust.',
        'CP360 — ConstructionProgress360 | A CONVAZANT Product',
      ];
    } else if (reportType === 'activity') {
      reportTitle = `Activity Log — ${project.project_name}`;
      const { data: logs } = await supabase.from('activity_log').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(50);
      reportLines = [
        `Project: ${project.project_name}`,
        `Report Date: ${today}`,
        '',
        `ACTIVITY LOG (${(logs || []).length} recent entries):`,
        ...(logs || []).map((l: any) => `  ${new Date(l.created_at).toLocaleString()} — [${l.module}] ${l.action_type} by ${l.user_full_name}${l.old_value ? ` | ${l.old_value} → ${l.new_value}` : ''}`),
      ];
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html>
        <html>
          <head>
            <title>${reportTitle}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1a1714; line-height: 1.6; max-width: 800px; margin: 0 auto; }
              h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; border-bottom: 2px solid #1a1714; padding-bottom: 8px; }
              .meta { color: #888; font-size: 11px; margin-bottom: 24px; }
              pre { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; white-space: pre-wrap; line-height: 1.8; }
              .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
              @media print { body { padding: 20px; } }
            </style>
          </head>
          <body>
            <h1>${reportTitle}</h1>
            <div class="meta">Generated by CP360 · ConstructionProgress360</div>
            <pre>${reportLines.join('\n')}</pre>
            <div class="footer">CP360 — ConstructionProgress360 | A CONVAZANT Product · ${today}</div>
            <script>window.onload = function(){ window.print(); }<\/script>
          </body>
        </html>`);
      printWindow.document.close();
    }
    setPrinting(null);
  }

  const statusConfig = (status: string) => {
    if (status === 'Delayed') return { dot: 'bg-hazard-500', text: 'text-hazard-600' };
    if (status === 'In Progress') return { dot: 'bg-steel-500', text: 'text-steel-600' };
    if (status === 'Completed') return { dot: 'bg-site-500', text: 'text-site-600' };
    return { dot: 'bg-concrete-400', text: 'text-concrete-500' };
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-concrete-900">Reports & Export</h1>
        <p className="text-sm text-concrete-500 mt-0.5">Select a project to generate and print reports</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-concrete-400 text-sm">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-concrete-400 text-sm">No projects found.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1">
            <h2 className="text-xs font-semibold text-concrete-500 uppercase tracking-wider mb-3">Select Project</h2>
            <div className="space-y-2">
              {projects.map(p => {
                const sc = statusConfig(p.status);
                const isSelected = selectedProject?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProject(p)}
                    className={`w-full text-left card p-4 transition-all hover:shadow-sm ${isSelected ? 'border-steel-400 ring-1 ring-steel-300' : ''}`}
                  >
                    <p className="font-semibold text-concrete-900 text-sm">{p.project_name}</p>
                    <p className="text-xs text-concrete-400 mt-0.5">{p.client_name}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      <span className={`text-xs ${sc.text}`}>{p.status} · {p.progress_percentage}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2">
            <h2 className="text-xs font-semibold text-concrete-500 uppercase tracking-wider mb-3">
              {selectedProject ? `Reports — ${selectedProject.project_name}` : 'Select a project'}
            </h2>
            {!selectedProject ? (
              <div className="flex items-center justify-center py-20 text-concrete-400 text-sm bg-concrete-50 rounded-xl border border-concrete-100">
                Select a project on the left to generate reports.
              </div>
            ) : (
              <div className="space-y-3">
                {REPORT_TYPES.map(rt => {
                  const Icon = rt.icon;
                  const isPrinting = printing === rt.id;
                  return (
                    <div key={rt.id} className="card p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-concrete-100 flex items-center justify-center">
                            <Icon className="w-4 h-4 text-concrete-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-concrete-900">{rt.label}</p>
                            <p className="text-xs text-concrete-500">{rt.desc}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => printReport(rt.id, selectedProject)}
                            disabled={!!printing}
                            className="btn-secondary text-xs disabled:opacity-40"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            {isPrinting ? 'Loading...' : 'Print'}
                          </button>
                          <button
                            onClick={() => printReport(rt.id, selectedProject)}
                            disabled={!!printing}
                            className="btn-ghost text-xs disabled:opacity-40"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Export
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="card p-4 border-dashed bg-concrete-50 text-center">
                  <p className="text-xs text-concrete-500">
                    For the full AI-generated report, use the project's AI Summary tab.
                  </p>
                  <button onClick={() => onViewProject(selectedProject.id)} className="text-xs text-steel-600 hover:text-steel-800 font-medium mt-1 transition-colors">
                    Open project →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
