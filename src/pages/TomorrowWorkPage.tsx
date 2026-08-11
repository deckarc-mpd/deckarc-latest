import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Sun, CheckSquare, Users, Package, ShieldCheck,
  AlertTriangle, RefreshCw, ChevronRight, Cloud, ExternalLink, Clock, TrendingDown,
} from 'lucide-react';

interface TomorrowTask {
  id: string;
  project_id: string;
  project_name: string;
  task_name: string;
  category: string;
  assigned_role: string;
  status: string;
  planned_start_date: string | null;
  planned_finish_date: string | null;
  projected_start_date: string | null;
  projected_finish_date: string | null;
  weather_sensitive: boolean;
  weather_risk_type: string;
  blocked_reason: string;
  // bucket assigned during load
  bucket?: 'starting' | 'due' | 'continuing';
}

interface ScheduleImpact {
  id: string;
  project_id: string;
  project_name: string;
  client_safe_reason: string;
  estimated_delay_days: number;
  schedule_impact_status: string;
  delay_category: string;
  created_at: string;
}

interface CrewStatus {
  task_id: string | null;
  project_id: string;
  project_name: string;
  scheduled_date: string;
  confirmation_status: string;
  crew_available: boolean;
  start_time_confirmed: boolean;
  scope_understood: boolean;
  site_access_confirmed: boolean;
}

interface MaterialReady {
  project_id: string;
  project_name: string;
  material_name: string;
  material_ready_status: string;
  expected_delivery_date: string | null;
  related_task_id: string | null;
}

interface ScheduledInspection {
  id: string;
  project_id: string;
  project_name: string;
  inspection_type: string;
  scheduled_date: string;
  inspector_name: string;
  jurisdiction: string;
  result: string;
}

export default function TomorrowWorkPage({ onViewProject, onNavigateToActionBoard }: { onViewProject?: (id: string) => void; onNavigateToActionBoard?: () => void }) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<TomorrowTask[]>([]);
  const [crews, setCrews] = useState<CrewStatus[]>([]);
  const [materials, setMaterials] = useState<MaterialReady[]>([]);
  const [inspections, setInspections] = useState<ScheduledInspection[]>([]);
  const [impacts, setImpacts] = useState<ScheduleImpact[]>([]);
  const [loading, setLoading] = useState(true);

  const _tomorrowDate = new Date();
  _tomorrowDate.setDate(_tomorrowDate.getDate() + 1);
  const tomorrow = [
    _tomorrowDate.getFullYear(),
    String(_tomorrowDate.getMonth() + 1).padStart(2, '0'),
    String(_tomorrowDate.getDate()).padStart(2, '0'),
  ].join('-');
  const tomorrowDisplay = _tomorrowDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    const [projRes, taskRes, crewRes, matRes, insRes, impactRes] = await Promise.all([
      supabase.from('projects').select('id,project_name,status,is_archived,is_deleted,permits_applicability'),
      // Fetch tasks that start, are due, or are in-progress spanning tomorrow
      supabase.from('tasks').select('*').eq('is_deleted', false)
        .or([
          `planned_start_date.eq.${tomorrow}`,
          `projected_start_date.eq.${tomorrow}`,
          `planned_finish_date.eq.${tomorrow}`,
          `projected_finish_date.eq.${tomorrow}`,
          `status.eq.In Progress`,
        ].join(','))
        .neq('status', 'Completed'),
      supabase.from('crew_confirmations').select('*').eq('scheduled_date', tomorrow),
      supabase.from('materials').select('*').eq('expected_delivery_date', tomorrow),
      supabase.from('inspections').select('*').eq('scheduled_date', tomorrow)
        .not('inspection_status', 'in', '("Passed","Cancelled","Completed")'),
      // Active open schedule impacts that could affect tomorrow's work.
      // These are unresolved blockers regardless of when they were created.
      // TODO: once an "impact_date" or "affects_date" field is added, filter to impacts ≤ tomorrow.
      supabase.from('project_delay_reasons')
        .select('id,project_id,client_safe_reason,estimated_delay_days,schedule_impact_status,delay_category,created_at')
        .in('schedule_impact_status', ['Pending Admin Review', 'Possible Impact'])
        .neq('status', 'Closed'),
    ]);

    // Only show records from active operational projects
    const allProjects = (projRes.data || []) as { id: string; project_name: string; status: string; is_archived: boolean; is_deleted: boolean; permits_applicability?: string }[];
    const activeProjects = allProjects.filter(p =>
      p.is_deleted !== true && p.is_archived !== true &&
      p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted'
    );
    const activeProjectIds = new Set(activeProjects.map(p => p.id));
    const permitApplicableIds = new Set(
      activeProjects.filter(p => p.permits_applicability !== 'Not Applicable').map(p => p.id)
    );
    const pmap: Record<string, string> = {};
    activeProjects.forEach(p => { pmap[p.id] = p.project_name; });

    // Bucket tasks: starting > due > continuing (In Progress spanning tomorrow)
    const rawTasks = (taskRes.data || []).filter((t: any) => {
      if (!activeProjectIds.has(t.project_id)) return false;
      const isPermitTask = t.task_type === 'Permit Task' || t.category === 'Permit' || t.category === 'Inspection';
      if (isPermitTask && !permitApplicableIds.has(t.project_id)) return false;
      return true;
    });

    const seen = new Set<string>();
    const bucketed: TomorrowTask[] = [];

    for (const bucket of ['starting', 'due', 'continuing'] as const) {
      for (const t of rawTasks) {
        if (seen.has(t.id)) continue;
        let match = false;
        if (bucket === 'starting') {
          match = t.planned_start_date === tomorrow || t.projected_start_date === tomorrow;
        } else if (bucket === 'due') {
          match = t.planned_finish_date === tomorrow || t.projected_finish_date === tomorrow;
        } else {
          // continuing: In Progress, started on/before tomorrow, ends on/after tomorrow
          const start  = t.planned_start_date  || t.projected_start_date  || null;
          const finish = t.planned_finish_date || t.projected_finish_date || null;
          match = t.status === 'In Progress' && start != null && finish != null
            && start <= tomorrow && finish >= tomorrow;
        }
        if (match) {
          seen.add(t.id);
          bucketed.push({ ...t, bucket, project_name: pmap[t.project_id] || 'Unknown' });
        }
      }
    }

    setTasks(bucketed);
    setCrews((crewRes.data || [])
      .filter((c: any) => activeProjectIds.has(c.project_id))
      .map((c: any) => ({ ...c, project_name: pmap[c.project_id] || 'Unknown' })));
    setMaterials((matRes.data || [])
      .filter((m: any) => activeProjectIds.has(m.project_id))
      .map((m: any) => ({ ...m, project_name: pmap[m.project_id] || 'Unknown' })));
    setInspections((insRes.data || [])
      .filter((i: any) => permitApplicableIds.has(i.project_id))
      .map((i: any) => ({ ...i, project_name: pmap[i.project_id] || 'Unknown' })));
    setImpacts((impactRes.data || [])
      .filter((d: any) => activeProjectIds.has(d.project_id))
      .map((d: any) => ({ ...d, project_name: pmap[d.project_id] || 'Unknown' })));
    setLoading(false);
  }

  const startingTasks   = tasks.filter(t => t.bucket === 'starting');
  const dueTasks        = tasks.filter(t => t.bucket === 'due');
  const continuingTasks = tasks.filter(t => t.bucket === 'continuing');
  const totalTaskCount  = tasks.length;

  const unconfirmedCrews  = crews.filter(c => c.confirmation_status !== 'Confirmed');
  const notReadyMaterials = materials.filter(m => m.material_ready_status !== 'Ready');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Sun className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-concrete-900">Tomorrow's Plan</h1>
          </div>
          <p className="text-sm text-concrete-500 pl-7">{tomorrowDisplay}</p>
        </div>
        <button onClick={load} className="btn-ghost">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-concrete-400 text-sm gap-2">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Loading tomorrow's plan...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Readiness summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ReadinessCard icon={CheckSquare} label="Tomorrow's Tasks" value={totalTaskCount} color={totalTaskCount > 0 ? 'blue' : 'green'} />
            <ReadinessCard icon={Users} label="Crews Unconfirmed" value={unconfirmedCrews.length} color={unconfirmedCrews.length > 0 ? 'red' : 'green'} />
            <ReadinessCard icon={Package} label="Material Deliveries" value={materials.length} color={notReadyMaterials.length > 0 ? 'yellow' : 'blue'} />
            <ReadinessCard icon={ShieldCheck} label="Inspections" value={inspections.length} color={inspections.length > 0 ? 'yellow' : 'green'} />
          </div>

          {/* Unconfirmed crews alert */}
          {unconfirmedCrews.length > 0 && (
            <div className="flex items-center gap-3 bg-hazard-50 border border-hazard-200 text-hazard-700 text-xs px-3 py-2.5 rounded-lg">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{unconfirmedCrews.length} crew{unconfirmedCrews.length > 1 ? 's' : ''} have not confirmed availability for tomorrow. Follow up immediately.</span>
              {onNavigateToActionBoard && (
                <button
                  onClick={onNavigateToActionBoard}
                  className="flex items-center gap-1 font-semibold text-hazard-700 hover:text-hazard-900 border border-hazard-300 bg-hazard-100 hover:bg-hazard-200 px-2 py-1 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
                >
                  <ExternalLink className="w-3 h-3" /> Review in Action Board
                </button>
              )}
            </div>
          )}

          {/* Schedule impacts warning */}
          {impacts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200">
                <TrendingDown className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <h2 className="text-sm font-bold text-amber-800">Schedule Impacts Affecting Tomorrow</h2>
                <span className="text-xs text-amber-600 font-medium">({impacts.length})</span>
                {onNavigateToActionBoard && (
                  <button
                    onClick={onNavigateToActionBoard}
                    className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Review
                  </button>
                )}
              </div>
              <div className="divide-y divide-amber-100">
                {impacts.map(d => (
                  <div key={d.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-900 mb-0.5">{d.project_name}</p>
                        <p className="text-xs text-amber-800 leading-relaxed">{d.client_safe_reason || 'Pending schedule impact review.'}</p>
                      </div>
                      {d.estimated_delay_days > 0 && (
                        <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                          +{d.estimated_delay_days}d
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-amber-600 mt-1">{d.schedule_impact_status}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tasks Starting Tomorrow */}
          <Section title="Tasks Starting Tomorrow" icon={CheckSquare} count={startingTasks.length} emptyText="No tasks scheduled to start tomorrow.">
            {startingTasks.map(t => (
              <ItemCard
                key={t.id}
                title={t.task_name}
                subtitle={`${t.category} · ${(t.assigned_role || 'Unassigned').replace('_', ' ')}`}
                project={t.project_name}
                projectId={t.project_id}
                onViewProject={onViewProject}
                onActionBoard={onNavigateToActionBoard}
                tags={[
                  { label: 'Starting', color: 'bg-blue-100 text-blue-700' },
                  t.weather_sensitive ? { label: 'Weather Sensitive', color: 'bg-steel-100 text-steel-600', Icon: Cloud } : null,
                  t.blocked_reason ? { label: 'Blocked', color: 'bg-hazard-100 text-hazard-700' } : null,
                ].filter(Boolean) as Tag[]}
                detail={t.blocked_reason || undefined}
              />
            ))}
          </Section>

          {/* Tasks Due Tomorrow */}
          <Section title="Tasks Due Tomorrow" icon={CheckSquare} count={dueTasks.length} emptyText="No tasks due tomorrow.">
            {dueTasks.map(t => (
              <ItemCard
                key={t.id}
                title={t.task_name}
                subtitle={`${t.category} · ${(t.assigned_role || 'Unassigned').replace('_', ' ')}`}
                project={t.project_name}
                projectId={t.project_id}
                onViewProject={onViewProject}
                onActionBoard={onNavigateToActionBoard}
                tags={[
                  { label: 'Due Tomorrow', color: 'bg-amber-100 text-amber-700' },
                  t.status !== 'Not Started' && t.status !== 'In Progress' ? { label: t.status, color: 'bg-slate-100 text-slate-600' } : null,
                  t.blocked_reason ? { label: 'Blocked', color: 'bg-hazard-100 text-hazard-700' } : null,
                ].filter(Boolean) as Tag[]}
                detail={t.blocked_reason || undefined}
              />
            ))}
          </Section>

          {/* Continuing Tasks (In Progress, spanning tomorrow) */}
          <Section title="Tasks Continuing Tomorrow" icon={Clock} count={continuingTasks.length} emptyText="No in-progress tasks spanning tomorrow.">
            {continuingTasks.map(t => (
              <ItemCard
                key={t.id}
                title={t.task_name}
                subtitle={`${t.category} · ${(t.assigned_role || 'Unassigned').replace('_', ' ')}`}
                project={t.project_name}
                projectId={t.project_id}
                onViewProject={onViewProject}
                onActionBoard={onNavigateToActionBoard}
                tags={[
                  { label: 'In Progress', color: 'bg-blue-50 text-blue-700' },
                  t.weather_sensitive ? { label: 'Weather Sensitive', color: 'bg-steel-100 text-steel-600', Icon: Cloud } : null,
                  t.blocked_reason ? { label: 'Blocked', color: 'bg-hazard-100 text-hazard-700' } : null,
                ].filter(Boolean) as Tag[]}
                detail={t.blocked_reason || undefined}
              />
            ))}
          </Section>

          {/* Crew confirmations */}
          <Section
            title={unconfirmedCrews.length > 0 && crews.length > unconfirmedCrews.length
              ? `Crew Confirmations (${unconfirmedCrews.length} unconfirmed)`
              : 'Crew Confirmations'}
            icon={Users}
            count={crews.length}
            emptyText="No crew confirmations scheduled for tomorrow."
          >
            {crews.map((c, i) => (
              <ItemCard
                key={i}
                title={`Crew Confirmation`}
                subtitle={`Status: ${c.confirmation_status}`}
                project={c.project_name}
                projectId={c.project_id}
                onViewProject={onViewProject}
                onActionBoard={onNavigateToActionBoard}
                tags={[
                  !c.crew_available ? { label: 'Crew Unavailable', color: 'bg-hazard-100 text-hazard-700' } : null,
                  !c.start_time_confirmed ? { label: 'Time Unconfirmed', color: 'bg-amber-100 text-amber-700' } : null,
                  !c.site_access_confirmed ? { label: 'Site Access?', color: 'bg-amber-100 text-amber-700' } : null,
                  c.confirmation_status === 'Confirmed' ? { label: 'Confirmed', color: 'bg-site-100 text-site-700' } : null,
                ].filter(Boolean) as Tag[]}
              />
            ))}
          </Section>

          {/* Material deliveries */}
          <Section title="Material Deliveries" icon={Package} count={materials.length} emptyText="No material deliveries scheduled for tomorrow.">
            {materials.map((m, i) => (
              <ItemCard
                key={i}
                title={m.material_name}
                subtitle={`Ready status: ${m.material_ready_status}`}
                project={m.project_name}
                projectId={m.project_id}
                onViewProject={onViewProject}
                onActionBoard={onNavigateToActionBoard}
                tags={[
                  m.material_ready_status !== 'Ready' ? { label: 'Not Ready', color: 'bg-hazard-100 text-hazard-700' } : { label: 'Ready', color: 'bg-site-100 text-site-700' },
                ]}
              />
            ))}
          </Section>

          {/* Inspections */}
          <Section title="Scheduled Inspections" icon={ShieldCheck} count={inspections.length} emptyText="No inspections scheduled for tomorrow.">
            {inspections.map(i => (
              <ItemCard
                key={i.id}
                title={`${i.inspection_type} Inspection`}
                subtitle={`Inspector: ${i.inspector_name || 'TBD'}${i.jurisdiction ? ` · ${i.jurisdiction}` : ''}`}
                project={i.project_name}
                projectId={i.project_id}
                onViewProject={onViewProject}
                tags={[]}
              />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

interface Tag { label: string; color: string; Icon?: React.ElementType; }

function ReadinessCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  const configs: Record<string, string> = {
    blue: 'bg-steel-50 border-steel-100 text-steel-700',
    green: 'bg-site-50 border-site-100 text-site-700',
    yellow: 'bg-amber-50 border-amber-100 text-amber-700',
    red: 'bg-hazard-50 border-hazard-100 text-hazard-700',
  };
  const iconConfigs: Record<string, string> = {
    blue: 'bg-steel-100 text-steel-600',
    green: 'bg-site-100 text-site-600',
    yellow: 'bg-amber-100 text-amber-600',
    red: 'bg-hazard-100 text-hazard-600',
  };
  const c = configs[color] || configs.blue;
  const ic = iconConfigs[color] || iconConfigs.blue;
  return (
    <div className={`rounded-xl border p-4 ${c}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${ic}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mt-0.5">{label}</p>
    </div>
  );
}

function Section({ title, icon: Icon, count, emptyText, children }: {
  title: string; icon: React.ElementType; count: number; emptyText: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-concrete-500" />
        <h2 className="text-sm font-bold text-concrete-800">{title}</h2>
        <span className="text-xs text-concrete-400 font-medium">({count})</span>
      </div>
      {count === 0 ? (
        <div className="text-center py-6 text-concrete-400 text-sm bg-concrete-50 rounded-xl border border-concrete-100">{emptyText}</div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function ItemCard({ title, subtitle, project, projectId, onViewProject, onActionBoard, tags, detail }: {
  title: string; subtitle: string; project: string; projectId: string;
  onViewProject?: (id: string) => void; onActionBoard?: () => void; tags: Tag[]; detail?: string;
}) {
  const isBlocked = tags.some(t => t.label === 'Blocked' || t.label === 'Crew Unavailable' || t.label === 'Not Ready');
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-concrete-900">{title}</p>
          <p className="text-xs text-concrete-500 mt-0.5">{subtitle}</p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag, i) => (
                <span key={i} className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${tag.color}`}>
                  {tag.Icon && <tag.Icon className="w-3 h-3" />}
                  {tag.label}
                </span>
              ))}
            </div>
          )}
          {detail && <p className="text-xs text-concrete-500 mt-1.5 bg-concrete-50 rounded px-2 py-1">{detail}</p>}
          <p className="text-xs text-concrete-400 font-medium mt-1.5">{project}</p>
          {isBlocked && onActionBoard && (
            <button
              onClick={onActionBoard}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Review in Action Board
            </button>
          )}
        </div>
        {onViewProject && (
          <button
            onClick={() => onViewProject(projectId)}
            className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
