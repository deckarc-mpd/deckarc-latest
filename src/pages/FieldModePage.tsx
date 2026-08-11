import { useEffect, useState } from 'react';
import { supabase, Task, Project } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  MapPin, CheckSquare, Camera, AlertTriangle,
  LogIn, LogOut, ChevronRight, Sun, RefreshCw, Send
} from 'lucide-react';

interface FieldTask extends Task {
  project_name: string;
  project_address: string;
  project_city: string;
  project_state: string;
}

type FieldView = 'list' | 'task' | 'update' | 'issue';

export default function FieldModePage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<FieldView>('list');
  const [selectedTask, setSelectedTask] = useState<FieldTask | null>(null);
  const [checkedIn, setCheckedIn] = useState<Record<string, string>>({});
  const [updateText, setUpdateText] = useState('');
  const [tomorrowText, setTomorrowText] = useState('');
  const [issueText, setIssueText] = useState('');
  const [issueSeverity, setIssueSeverity] = useState('Medium');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_deleted', false)
      .neq('status', 'Completed')
      .or(`planned_start_date.lte.${today},projected_start_date.lte.${today}`)
      .order('planned_start_date');

    if (!taskData || taskData.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const projectIds = [...new Set(taskData.map((t: Task) => t.project_id))];
    const { data: projects } = await supabase.from('projects').select('id,project_name,address,city,state').in('id', projectIds);
    const pmap: Record<string, any> = {};
    (projects || []).forEach((p: any) => { pmap[p.id] = p; });

    const enriched: FieldTask[] = taskData.map((t: Task) => ({
      ...t,
      project_name: pmap[t.project_id]?.project_name || 'Unknown Project',
      project_address: pmap[t.project_id]?.address || '',
      project_city: pmap[t.project_id]?.city || '',
      project_state: pmap[t.project_id]?.state || '',
    }));

    setTasks(enriched);
    setLoading(false);
  }

  async function checkIn(taskId: string) {
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setCheckedIn(prev => ({ ...prev, [taskId]: time }));
    if (selectedTask?.status === 'Not Started') {
      await supabase.from('tasks').update({ status: 'In Progress', actual_start_date: today }).eq('id', taskId);
      setSelectedTask(prev => prev ? { ...prev, status: 'In Progress' } : null);
    }
  }

  async function submitUpdate() {
    if (!selectedTask || !profile) return;
    setSaving(true);
    await supabase.from('daily_updates').insert({
      project_id: selectedTask.project_id,
      task_id: selectedTask.id,
      user_id: profile.id,
      update_date: today,
      work_completed_today: updateText,
      work_planned_tomorrow: tomorrowText,
      current_status: selectedTask.status,
      blockers: '',
      delay_reason: '',
      delay_days: 0,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); setView('task'); }, 2000);
  }

  async function submitIssue() {
    if (!selectedTask || !profile) return;
    setSaving(true);
    await supabase.from('incidents').insert({
      project_id: selectedTask.project_id,
      related_task_id: selectedTask.id,
      incident_title: issueText,
      incident_type: 'Field Issue',
      incident_date: today,
      reported_by: profile.full_name,
      severity_level: issueSeverity,
      incident_status: 'Open',
      incident_description: issueText,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); setView('task'); }, 2000);
  }

  async function markStatus(status: string) {
    if (!selectedTask) return;
    await supabase.from('tasks').update({
      status,
      actual_finish_date: status === 'Completed' ? today : null,
      progress_percentage: status === 'Completed' ? 100 : selectedTask.progress_percentage,
    }).eq('id', selectedTask.id);
    setSelectedTask(prev => prev ? { ...prev, status } : null);
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status } : t));
  }

  const openDetails = (task: FieldTask) => { setSelectedTask(task); setView('task'); };

  // ── Task List ──────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="min-h-screen bg-steel-950 text-white px-4 py-6 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-amber-400" />
              <h1 className="text-lg font-bold">Field Mode</h1>
            </div>
            <p className="text-sm text-steel-400 mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <button onClick={load} className="p-2 rounded-xl bg-steel-800 hover:bg-steel-700 transition-colors">
            <RefreshCw className="w-4 h-4 text-steel-400" />
          </button>
        </div>

        <p className="text-sm text-steel-400 mb-3 font-medium uppercase tracking-wider text-xs">Today's Tasks</p>

        {loading ? (
          <div className="text-center py-16 text-steel-500 text-sm">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16 text-steel-500">
            <CheckSquare className="w-12 h-12 mx-auto mb-3 text-steel-700" />
            <p className="font-medium">No tasks assigned for today</p>
            <p className="text-sm text-steel-600 mt-1">Check back tomorrow or contact your supervisor.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => {
              const isChecked = !!checkedIn[task.id];
              const statusDot = task.status === 'Completed' ? 'bg-site-500' :
                task.status === 'In Progress' ? 'bg-amber-400' : 'bg-steel-600';
              return (
                <button
                  key={task.id}
                  onClick={() => openDetails(task)}
                  className="w-full text-left bg-steel-900 border border-steel-800 rounded-2xl p-4 hover:border-steel-600 active:scale-[0.99] transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                        <span className="text-xs text-steel-400 font-medium uppercase tracking-wide">{task.status}</span>
                        {isChecked && <span className="text-xs text-site-400">Checked in {checkedIn[task.id]}</span>}
                      </div>
                      <p className="font-semibold text-white text-base leading-tight">{task.task_name}</p>
                      <p className="text-sm text-steel-400 mt-1">{task.project_name}</p>
                      {task.project_city && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-steel-500">
                          <MapPin className="w-3 h-3" />
                          {task.project_address ? `${task.project_address}, ` : ''}{task.project_city}, {task.project_state}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-steel-600 flex-shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Task Detail ────────────────────────────────────────────────────────────
  if (view === 'task' && selectedTask) {
    const isChecked = !!checkedIn[selectedTask.id];
    return (
      <div className="min-h-screen bg-steel-950 text-white px-4 py-6 max-w-lg mx-auto">
        <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-steel-400 text-sm mb-5 hover:text-white transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back
        </button>

        <div className="mb-6">
          <p className="text-xs text-steel-500 uppercase tracking-wider mb-1">{selectedTask.project_name}</p>
          <h1 className="text-xl font-bold text-white leading-tight">{selectedTask.task_name}</h1>
          {selectedTask.project_city && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-steel-400">
              <MapPin className="w-4 h-4" />
              {selectedTask.project_address ? `${selectedTask.project_address}, ` : ''}{selectedTask.project_city}, {selectedTask.project_state}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {/* Check In / Out */}
          <button
            onClick={() => isChecked ? undefined : checkIn(selectedTask.id)}
            className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all ${
              isChecked
                ? 'bg-steel-800 text-steel-400 cursor-default'
                : 'bg-site-600 hover:bg-site-700 active:scale-[0.98] text-white shadow-lg'
            }`}
          >
            <LogIn className="w-5 h-5" />
            {isChecked ? `Checked in at ${checkedIn[selectedTask.id]}` : 'Check In'}
          </button>

          {/* Mark Status */}
          <div className="bg-steel-900 border border-steel-800 rounded-2xl p-4">
            <p className="text-xs text-steel-500 uppercase tracking-wider mb-3">Task Status</p>
            <div className="grid grid-cols-2 gap-2">
              {['Not Started', 'In Progress', 'Blocked', 'Completed'].map(s => (
                <button
                  key={s}
                  onClick={() => markStatus(s)}
                  className={`py-3 rounded-xl text-sm font-semibold transition-all ${
                    selectedTask.status === s
                      ? s === 'Completed' ? 'bg-site-600 text-white' : s === 'Blocked' ? 'bg-hazard-700 text-white' : 'bg-steel-500 text-white'
                      : 'bg-steel-800 text-steel-400 hover:bg-steel-700 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={() => setView('update')}
            className="w-full py-4 bg-steel-800 hover:bg-steel-700 border border-steel-700 rounded-2xl font-semibold text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
          >
            <Send className="w-5 h-5 text-steel-400" />
            Submit Daily Update
          </button>

          <button
            onClick={() => setView('issue')}
            className="w-full py-4 bg-hazard-900/50 hover:bg-hazard-900 border border-hazard-800 rounded-2xl font-semibold text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98] text-hazard-300"
          >
            <AlertTriangle className="w-5 h-5" />
            Report Issue
          </button>

          <button className="w-full py-4 bg-steel-800 hover:bg-steel-700 border border-steel-700 rounded-2xl font-semibold text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98] text-steel-400">
            <Camera className="w-5 h-5" />
            Upload Photo (Placeholder)
          </button>
        </div>
      </div>
    );
  }

  // ── Submit Daily Update ─────────────────────────────────────────────────────
  if (view === 'update' && selectedTask) {
    return (
      <div className="min-h-screen bg-steel-950 text-white px-4 py-6 max-w-lg mx-auto">
        <button onClick={() => setView('task')} className="flex items-center gap-1.5 text-steel-400 text-sm mb-5 hover:text-white transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back
        </button>
        <h1 className="text-xl font-bold mb-2">Daily Update</h1>
        <p className="text-sm text-steel-400 mb-6">{selectedTask.task_name}</p>

        {saved ? (
          <div className="flex items-center justify-center gap-3 py-12 text-site-400">
            <CheckSquare className="w-8 h-8" />
            <p className="text-lg font-semibold">Update submitted!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-steel-500 uppercase tracking-wider mb-2">What did you complete today? *</label>
              <textarea
                rows={4}
                value={updateText}
                onChange={e => setUpdateText(e.target.value)}
                placeholder="Describe work completed..."
                className="w-full bg-steel-900 border border-steel-700 rounded-xl px-4 py-3 text-white placeholder-steel-600 text-base focus:outline-none focus:border-steel-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-steel-500 uppercase tracking-wider mb-2">What's planned for tomorrow?</label>
              <textarea
                rows={3}
                value={tomorrowText}
                onChange={e => setTomorrowText(e.target.value)}
                placeholder="Describe tomorrow's planned work..."
                className="w-full bg-steel-900 border border-steel-700 rounded-xl px-4 py-3 text-white placeholder-steel-600 text-base focus:outline-none focus:border-steel-500 resize-none"
              />
            </div>
            <button
              onClick={submitUpdate}
              disabled={saving || !updateText}
              className="w-full py-4 bg-site-600 hover:bg-site-700 disabled:opacity-40 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
            >
              {saving ? 'Submitting...' : 'Submit Update'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Report Issue ─────────────────────────────────────────────────────────
  if (view === 'issue' && selectedTask) {
    return (
      <div className="min-h-screen bg-steel-950 text-white px-4 py-6 max-w-lg mx-auto">
        <button onClick={() => setView('task')} className="flex items-center gap-1.5 text-steel-400 text-sm mb-5 hover:text-white transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back
        </button>
        <h1 className="text-xl font-bold mb-2">Report Issue</h1>
        <p className="text-sm text-steel-400 mb-6">{selectedTask.task_name}</p>

        {saved ? (
          <div className="flex items-center justify-center gap-3 py-12 text-site-400">
            <CheckSquare className="w-8 h-8" />
            <p className="text-lg font-semibold">Issue reported!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-steel-500 uppercase tracking-wider mb-2">Severity</label>
              <div className="grid grid-cols-3 gap-2">
                {['Low', 'Medium', 'High'].map(s => (
                  <button
                    key={s}
                    onClick={() => setIssueSeverity(s)}
                    className={`py-3 rounded-xl font-semibold text-sm transition-all ${
                      issueSeverity === s
                        ? s === 'High' ? 'bg-hazard-700 text-white' : s === 'Medium' ? 'bg-amber-700 text-white' : 'bg-steel-500 text-white'
                        : 'bg-steel-800 text-steel-400 hover:bg-steel-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-steel-500 uppercase tracking-wider mb-2">Describe the issue *</label>
              <textarea
                rows={5}
                value={issueText}
                onChange={e => setIssueText(e.target.value)}
                placeholder="What happened? Be specific..."
                className="w-full bg-steel-900 border border-steel-700 rounded-xl px-4 py-3 text-white placeholder-steel-600 text-base focus:outline-none focus:border-steel-500 resize-none"
              />
            </div>
            <button
              onClick={submitIssue}
              disabled={saving || !issueText}
              className="w-full py-4 bg-hazard-700 hover:bg-hazard-600 disabled:opacity-40 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
            >
              {saving ? 'Reporting...' : 'Report Issue'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
