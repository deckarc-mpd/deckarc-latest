import { useEffect, useState, useRef } from 'react';
import { supabase, Project, DailyUpdate, Task } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../Modal';
import { uploadFile, insertProjectFile, getSignedUrl } from '../../lib/fileUpload';
import { Plus, ChevronDown, ChevronUp, Camera, Upload, Loader, Image, X } from 'lucide-react';

interface PhotoAttachment {
  id: string;
  file_name: string;
  storage_path: string | null;
  signedUrl?: string | null;
}

function PhotoUploadStrip({
  projectId, updateId, organizationId, userId, userRole, onUploaded,
}: {
  projectId: string; updateId: string; organizationId: string | null;
  userId: string; userRole: string; onUploaded: () => void;
}) {
  const [photos, setPhotos] = useState<PhotoAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadPhotos(); }, [updateId]);

  async function loadPhotos() {
    const { data } = await supabase
      .from('project_files')
      .select('id, file_name, storage_path')
      .eq('project_id', projectId)
      .eq('related_module', 'Daily Update')
      .eq('related_record_id', updateId)
      .eq('is_deleted', false)
      .order('uploaded_at', { ascending: false });

    const enriched = await Promise.all(
      (data || []).map(async (f: any) => ({
        ...f,
        signedUrl: await getSignedUrl(f.storage_path),
      }))
    );
    setPhotos(enriched);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFile(file, projectId, organizationId);
      await insertProjectFile({
        projectId, uploadedByUserId: userId, uploadedByRole: userRole,
        organizationId, fileName: result.fileName, fileType: result.fileType,
        fileSizeKb: result.fileSizeKb, storagePath: result.storagePath,
        documentCategory: 'Daily Update Photo',
        relatedModule: 'Daily Update', relatedRecordId: updateId, clientVisible: false,
      });
      await loadPhotos();
      onUploaded();
    } catch {}
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="mt-3 pt-3 border-t border-concrete-50">
      <div className="flex items-center gap-2 mb-2">
        <Camera className="w-3.5 h-3.5 text-concrete-400" />
        <span className="text-xs font-medium text-concrete-500">Photos ({photos.length})</span>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="ml-auto text-[11px] flex items-center gap-1 text-concrete-500 hover:text-concrete-700 border border-concrete-200 hover:border-concrete-400 px-2 py-0.5 rounded-lg transition-colors"
        >
          {uploading ? <Loader className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {uploading ? 'Uploading...' : 'Add Photo'}
        </button>
        <input ref={fileRef} type="file" className="hidden" accept="image/*" onChange={handleFile} />
      </div>
      {photos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {photos.map(p => (
            <a key={p.id} href={p.signedUrl || '#'} target="_blank" rel="noopener noreferrer"
              className="w-16 h-16 rounded-lg bg-concrete-100 overflow-hidden block flex-shrink-0">
              {p.signedUrl ? (
                <img src={p.signedUrl} alt={p.file_name} className="w-full h-full object-cover hover:opacity-80 transition-opacity" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Image className="w-5 h-5 text-concrete-300" />
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DailyUpdatesTab({ project }: { project: Project }) {
  const { profile } = useAuth();
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    task_id: '', update_date: new Date().toISOString().split('T')[0],
    work_completed_today: '', work_planned_tomorrow: '', current_status: '',
    blockers: '', delay_reason: '', delay_days: 0,
    materials_delivered: '', materials_pending: '',
    permit_update: '', inspection_update: '', weather_issue: '',
    client_decision_needed: '', internal_note: '', client_visible_note: '',
  });
  const [saving, setSaving] = useState(false);
  const [savedUpdateId, setSavedUpdateId] = useState<string | null>(null);

  // Photo upload in modal
  const [modalPhotos, setModalPhotos] = useState<Array<{ file: File; preview: string }>>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isClient = profile?.role === 'CLIENT';
  const canSubmit = !isClient;

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    setLoading(true);
    const [updatesRes, tasksRes] = await Promise.all([
      supabase.from('daily_updates').select('*').eq('project_id', project.id).order('update_date', { ascending: false }),
      supabase.from('tasks').select('id, task_name').eq('project_id', project.id),
    ]);
    setUpdates(updatesRes.data || []);
    setTasks(tasksRes.data || []);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const { data: inserted } = await supabase.from('daily_updates').insert({
      project_id: project.id,
      user_id: profile?.id,
      ...form,
      task_id: form.task_id || null,
    }).select('id').single();

    if (form.delay_days > 0 && project.expected_finish_date) {
      const base = new Date(project.projected_finish_date || project.expected_finish_date);
      base.setDate(base.getDate() + form.delay_days);
      await supabase.from('projects').update({
        projected_finish_date: base.toISOString().split('T')[0],
        status: 'Delayed',
        alert_status: 'red',
      }).eq('id', project.id);
    }

    // Upload any photos that were attached in the modal
    if (inserted?.id && modalPhotos.length > 0 && profile) {
      await Promise.all(
        modalPhotos.map(async ({ file }) => {
          try {
            const result = await uploadFile(file, project.id, profile.organization_id ?? null);
            await insertProjectFile({
              projectId: project.id,
              uploadedByUserId: profile.id,
              uploadedByRole: profile.role,
              organizationId: profile.organization_id ?? null,
              fileName: result.fileName,
              fileType: result.fileType,
              fileSizeKb: result.fileSizeKb,
              storagePath: result.storagePath,
              documentCategory: 'Daily Update Photo',
              relatedModule: 'Daily Update',
              relatedRecordId: inserted.id,
              clientVisible: false,
            });
          } catch {}
        })
      );
    }

    setSaving(false);
    setShowModal(false);
    setModalPhotos([]);
    setSavedUpdateId(inserted?.id || null);
    load();
  }

  function addModalPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const preview = URL.createObjectURL(file);
      setModalPhotos(prev => [...prev, { file, preview }]);
    });
    if (photoInputRef.current) photoInputRef.current.value = '';
  }

  function removeModalPhoto(idx: number) {
    setModalPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-concrete-800">
          Daily Updates <span className="text-sm font-normal text-concrete-400">({updates.length})</span>
        </h2>
        {canSubmit && (
          <button onClick={() => {
            setForm({ task_id: '', update_date: new Date().toISOString().split('T')[0], work_completed_today: '', work_planned_tomorrow: '', current_status: '', blockers: '', delay_reason: '', delay_days: 0, materials_delivered: '', materials_pending: '', permit_update: '', inspection_update: '', weather_issue: '', client_decision_needed: '', internal_note: '', client_visible_note: '' });
            setModalPhotos([]);
            setShowModal(true);
          }} className="btn-primary">
            <Plus className="w-4 h-4" />
            Submit Update
          </button>
        )}
      </div>

      {loading ? <div className="text-center py-12 text-concrete-400 text-sm">Loading...</div> :
        updates.length === 0 ? <div className="text-center py-12 text-concrete-400 text-sm">No daily updates yet.</div> :
        <div className="space-y-3">
          {updates.map(u => {
            const isOpen = expanded === u.id;
            const task = tasks.find(t => t.id === u.task_id);
            return (
              <div key={u.id} className="card overflow-hidden">
                <button className="w-full flex items-center justify-between p-4 text-left hover:bg-concrete-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : u.id)}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-concrete-900">
                        {new Date(u.update_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {task && <span className="text-xs text-concrete-500 bg-concrete-100 px-2 py-0.5 rounded-full">{task.task_name}</span>}
                      {u.delay_days > 0 && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{u.delay_days}d delay</span>}
                    </div>
                    <p className="text-xs text-concrete-500 mt-0.5 truncate max-w-md">{u.work_completed_today}</p>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-concrete-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-concrete-400 flex-shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-concrete-50 pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      {u.work_completed_today && (
                        <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Completed Today</p><p className="text-concrete-800">{u.work_completed_today}</p></div>
                      )}
                      {u.work_planned_tomorrow && (
                        <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Planned Tomorrow</p><p className="text-concrete-800">{u.work_planned_tomorrow}</p></div>
                      )}
                      {u.blockers && (
                        <div><p className="text-xs font-medium text-hazard-500 mb-0.5">Blockers</p><p className="text-concrete-800">{u.blockers}</p></div>
                      )}
                      {u.delay_reason && (
                        <div><p className="text-xs font-medium text-amber-600 mb-0.5">Reason for Delay ({u.delay_days} days)</p><p className="text-concrete-800">{u.delay_reason}</p></div>
                      )}
                      {u.materials_delivered && (
                        <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Materials Delivered</p><p className="text-concrete-800">{u.materials_delivered}</p></div>
                      )}
                      {u.materials_pending && (
                        <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Materials Pending</p><p className="text-concrete-800">{u.materials_pending}</p></div>
                      )}
                      {u.weather_issue && (
                        <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Weather Issue</p><p className="text-concrete-800">{u.weather_issue}</p></div>
                      )}
                      {u.client_visible_note && (
                        <div className="sm:col-span-2"><p className="text-xs font-medium text-steel-600 mb-0.5">Client Note</p><p className="text-concrete-800">{u.client_visible_note}</p></div>
                      )}
                      {!isClient && u.internal_note && (
                        <div className="sm:col-span-2"><p className="text-xs font-medium text-concrete-500 mb-0.5">Internal Note</p><p className="text-concrete-800">{u.internal_note}</p></div>
                      )}
                    </div>
                    {/* Photo strip for existing updates */}
                    {!isClient && profile && (
                      <PhotoUploadStrip
                        projectId={project.id}
                        updateId={u.id}
                        organizationId={profile.organization_id ?? null}
                        userId={profile.id}
                        userRole={profile.role}
                        onUploaded={() => {}}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      }

      {showModal && (
        <Modal title="Submit Daily Update" onClose={() => { setShowModal(false); setModalPhotos([]); }} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-concrete-600 mb-1">Date</label>
                <input type="date" value={form.update_date} onChange={e => setForm(f => ({ ...f, update_date: e.target.value }))}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-concrete-600 mb-1">Related Task</label>
                <select value={form.task_id} onChange={e => setForm(f => ({ ...f, task_id: e.target.value }))}
                  className="input-field">
                  <option value="">None</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
                </select>
              </div>
            </div>
            {[
              { label: 'Work Completed Today *', key: 'work_completed_today', rows: 2 },
              { label: 'Work Planned Tomorrow', key: 'work_planned_tomorrow', rows: 2 },
              { label: 'Blockers / Issues', key: 'blockers', rows: 1 },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-concrete-600 mb-1">{f.label}</label>
                <textarea rows={f.rows} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="input-field resize-none" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-concrete-600 mb-1">Delay Days (if any)</label>
                <input type="number" min="0" value={form.delay_days}
                  onChange={e => setForm(f => ({ ...f, delay_days: parseInt(e.target.value) || 0 }))}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-concrete-600 mb-1">Weather Issue</label>
                <input value={form.weather_issue} onChange={e => setForm(f => ({ ...f, weather_issue: e.target.value }))}
                  className="input-field" />
              </div>
            </div>
            {form.delay_days > 0 && (
              <div>
                <label className="block text-xs font-medium text-concrete-600 mb-1">Reason for Delay</label>
                <input value={form.delay_reason} onChange={e => setForm(f => ({ ...f, delay_reason: e.target.value }))}
                  className="input-field" />
              </div>
            )}
            {[
              { label: 'Materials Delivered', key: 'materials_delivered' },
              { label: 'Materials Pending', key: 'materials_pending' },
              { label: 'Permit Update', key: 'permit_update' },
              { label: 'Inspection Update', key: 'inspection_update' },
              { label: 'Client Decision Needed', key: 'client_decision_needed' },
              { label: 'Client-Visible Note', key: 'client_visible_note' },
              { label: 'Internal Note', key: 'internal_note' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-concrete-600 mb-1">{f.label}</label>
                <input value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="input-field" />
              </div>
            ))}

            {/* Photo attachments */}
            <div>
              <label className="block text-xs font-medium text-concrete-600 mb-1.5">Photos</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {modalPhotos.map((p, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden bg-concrete-100 flex-shrink-0">
                    <img src={p.preview} alt={p.file.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeModalPhoto(idx)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 rounded-full flex items-center justify-center"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-concrete-200 hover:border-steel-400 flex items-center justify-center flex-shrink-0 transition-colors"
                >
                  <Camera className="w-5 h-5 text-concrete-300" />
                </button>
              </div>
              <input ref={photoInputRef} type="file" className="hidden" accept="image/*" multiple onChange={addModalPhoto} />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => { setShowModal(false); setModalPhotos([]); }} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.work_completed_today} className="btn-primary disabled:opacity-50">
                {saving ? 'Submitting...' : 'Submit Update'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
