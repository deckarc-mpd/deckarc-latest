import { useEffect, useState } from 'react';
import { supabase, Project, PaymentMilestone } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../Modal';
import {
  Plus, Edit2, Trash2, DollarSign, AlertTriangle,
  CheckCircle, Clock, TrendingUp, CreditCard,
} from 'lucide-react';

// Status set kept compatible with ClientPaymentsPage and ClientDashboardPage.
// 'Paid', 'Due', 'Upcoming', 'Overdue' are the four statuses the client-facing
// pages use for calculations. Internal-only statuses are additive.
const PAYMENT_STATUSES = [
  'Upcoming',        // client sees: upcoming / not yet due
  'Due',             // client sees: payment due
  'Overdue',         // client sees: overdue
  'Paid',            // client sees: paid ✓
  // --- admin-only convenience statuses ---
  'Invoice Sent',
  'Due Today',
  'Due Soon',
  'Not Due',
  'Partially Paid',
  'Payment Hold',
  'Disputed',
  'Waived',
];

// Maps any admin status to the four client-facing buckets for summary math.
// Exported so ClientDashboardPage can also use it.
export function normalizePaymentStatus(status: string): 'Paid' | 'Due' | 'Overdue' | 'Upcoming' {
  if (status === 'Paid' || status === 'Waived') return 'Paid';
  if (status === 'Overdue' || status === 'Payment Hold' || status === 'Disputed') return 'Overdue';
  if (status === 'Due' || status === 'Due Today' || status === 'Due Soon' || status === 'Invoice Sent') return 'Due';
  return 'Upcoming';
}

function calcAlert(item: Partial<PaymentMilestone>): string {
  const norm = normalizePaymentStatus(item.status || '');
  if (norm === 'Paid') return 'green';
  if (norm === 'Overdue' || item.work_hold_required) return 'red';
  if (norm === 'Due') return 'yellow';
  if (item.due_date) {
    const diff = Math.floor((new Date(item.due_date).getTime() - Date.now()) / 86400000);
    if (diff < 0) return 'red';
    if (diff <= 3) return 'yellow';
  }
  return 'green';
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const blank = (): Partial<PaymentMilestone> => ({
  milestone_name: '', amount: 0, due_date: null, status: 'Upcoming', paid_date: null,
  payment_delay_expected: false, work_hold_required: false, responsible_party: '', notes: '',
});

function StatusBadge({ status }: { status: string }) {
  const norm = normalizePaymentStatus(status);
  const cls =
    norm === 'Paid'     ? 'bg-green-50 text-green-700 border-green-200' :
    norm === 'Overdue'  ? 'bg-red-50 text-red-700 border-red-200' :
    norm === 'Due'      ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}

export default function PaymentsTab({ project }: { project: Project }) {
  const { profile } = useAuth();
  const [items, setItems]       = useState<PaymentMilestone[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<PaymentMilestone | null>(null);
  const [form, setForm]         = useState<Partial<PaymentMilestone>>(blank());
  const [saving, setSaving]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PaymentMilestone | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN'].includes(profile?.role || '');

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('payment_milestones')
      .select('*')
      .eq('project_id', project.id)
      .order('due_date', { nullsFirst: false });
    setItems(data || []);
    setLoading(false);
  }

  function openAdd() { setEditItem(null); setForm(blank()); setShowModal(true); }
  function openEdit(item: PaymentMilestone) { setEditItem(item); setForm({ ...item }); setShowModal(true); }

  async function save() {
    if (!form.milestone_name?.trim()) return;
    setSaving(true);
    const payload = { ...form, project_id: project.id, alert_status: calcAlert(form) };
    if (editItem) {
      await supabase.from('payment_milestones').update(payload).eq('id', editItem.id);
    } else {
      await supabase.from('payment_milestones').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function deleteMilestone() {
    if (!confirmDelete) return;
    setDeleting(true);
    await supabase.from('payment_milestones').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    setConfirmDelete(null);
    load();
  }

  const f  = (k: keyof PaymentMilestone, v: any) => setForm(p => ({ ...p, [k]: v }));
  const fc = (k: keyof PaymentMilestone) => (e: React.ChangeEvent<HTMLInputElement>) => f(k, e.target.checked);

  // Summary math using normalized statuses so all admin statuses are counted correctly
  const total    = items.reduce((s, i) => s + (i.amount || 0), 0);
  const paid     = items.filter(i => normalizePaymentStatus(i.status) === 'Paid').reduce((s, i) => s + (i.amount || 0), 0);
  const overdue  = items.filter(i => normalizePaymentStatus(i.status) === 'Overdue').length;
  const pctPaid  = total > 0 ? Math.round((paid / total) * 100) : 0;

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            Payment Milestones
            <span className="text-sm font-normal text-slate-400 ml-1.5">({items.length})</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Payment schedule for this project. Visible to client in their portal.
          </p>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Milestone
          </button>
        )}
      </div>

      {/* Overdue alert */}
      {overdue > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2.5 rounded-xl">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {overdue} payment milestone{overdue > 1 ? 's' : ''} overdue or on hold — follow up immediately.
        </div>
      )}

      {/* Summary stats */}
      {items.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Contract Total', value: fmt(total),        icon: DollarSign, cls: 'text-slate-800' },
              { label: 'Collected',      value: fmt(paid),         icon: CheckCircle, cls: 'text-green-600' },
              { label: 'Remaining',      value: fmt(total - paid), icon: TrendingUp,  cls: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <s.icon className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-[11px] text-slate-500">{s.label}</p>
                </div>
                <p className={`text-xl font-bold tabular-nums ${s.cls}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-slate-600">Payment Progress</p>
              <p className="text-xs font-semibold text-slate-500 tabular-nums">{pctPaid}%</p>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pctPaid}%` }} />
            </div>
          </div>
        </>
      )}

      {/* Milestones list */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-slate-50">
          <CreditCard className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No payment milestones yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Add payment milestones to build the client-facing payment schedule.
            These will appear in the client's financial summary.
          </p>
          {canEdit && (
            <button onClick={openAdd} className="mt-4 btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" /> Add First Milestone
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map(item => {
            const norm = normalizePaymentStatus(item.status);
            const leftBorder = norm === 'Overdue' || item.work_hold_required ? 'border-l-4 border-l-red-400' :
                               norm === 'Due'                                ? 'border-l-4 border-l-amber-400' :
                               norm === 'Paid'                               ? 'border-l-4 border-l-green-400' :
                               '';
            return (
              <div
                key={item.id}
                className={`bg-white border border-slate-200 rounded-xl px-4 py-3.5 ${leftBorder}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <DollarSign className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium text-slate-800">{item.milestone_name}</span>
                        <StatusBadge status={item.status} />
                        {item.work_hold_required && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">Work Hold</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700 tabular-nums">{fmt(item.amount)}</span>
                        {item.due_date && (
                          <span className={norm === 'Overdue' ? 'text-red-600 font-medium' : ''}>
                            Due: {fmtDate(item.due_date)}
                          </span>
                        )}
                        {item.paid_date && (
                          <span className="text-green-600">Paid: {fmtDate(item.paid_date)}</span>
                        )}
                        {item.invoice_sent_date && (
                          <span>Invoice: {fmtDate(item.invoice_sent_date)}</span>
                        )}
                        {item.responsible_party && (
                          <span>{item.responsible_party}</span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.notes}</p>
                      )}
                      {item.payment_delay_expected && (
                        <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Payment delay expected
                        </p>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(item)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Future finance note — for estimate module integration */}
      {/* When Estimate module is available:
          Approved Estimate Total
          + Approved Change Orders Total
          − Payments Received
          = Balance Remaining
          This tab currently provides the Payments Received figure. */}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <Modal
          title={editItem ? 'Edit Payment Milestone' : 'Add Payment Milestone'}
          onClose={() => setShowModal(false)}
        >
          <div className="space-y-3">
            <div>
              <label className="label-sm">Milestone Name *</label>
              <input
                className="input-field"
                value={form.milestone_name || ''}
                onChange={e => f('milestone_name', e.target.value)}
                placeholder="e.g. Deposit, Framing Complete, Final Payment"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Amount ($) *</label>
                <input
                  type="number" min="0" step="0.01" className="input-field"
                  value={form.amount || 0}
                  onChange={e => f('amount', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="label-sm">Status</label>
                <select
                  className="input-field"
                  value={form.status || 'Upcoming'}
                  onChange={e => f('status', e.target.value)}
                >
                  {PAYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Due Date</label>
                <input
                  type="date" className="input-field"
                  value={(form.due_date as string) || ''}
                  onChange={e => f('due_date', e.target.value || null)}
                />
              </div>
              <div>
                <label className="label-sm">Paid Date</label>
                <input
                  type="date" className="input-field"
                  value={(form.paid_date as string) || ''}
                  onChange={e => f('paid_date', e.target.value || null)}
                />
              </div>
              <div>
                <label className="label-sm">Invoice Sent Date</label>
                <input
                  type="date" className="input-field"
                  value={(form.invoice_sent_date as string) || ''}
                  onChange={e => f('invoice_sent_date', e.target.value || null)}
                />
              </div>
              <div>
                <label className="label-sm">Responsible Party</label>
                <input
                  className="input-field"
                  value={form.responsible_party || ''}
                  onChange={e => f('responsible_party', e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={!!form.payment_delay_expected} onChange={fc('payment_delay_expected')} className="w-3.5 h-3.5 rounded" />
                Delay Expected
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={!!form.work_hold_required} onChange={fc('work_hold_required')} className="w-3.5 h-3.5 rounded" />
                Work Hold Required
              </label>
            </div>

            <div>
              <label className="label-sm">Internal Notes</label>
              <textarea
                rows={2} className="input-field resize-none"
                value={form.notes || ''}
                onChange={e => f('notes', e.target.value)}
                placeholder="Internal notes (not visible to client)"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !form.milestone_name?.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? 'Saving...' : editItem ? 'Update' : 'Add Milestone'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ── */}
      {confirmDelete && (
        <Modal title="Delete Milestone?" onClose={() => setConfirmDelete(null)} size="sm">
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm font-medium text-slate-800">{confirmDelete.milestone_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{fmt(confirmDelete.amount)}</p>
            </div>
            <p className="text-sm text-slate-600">
              This will permanently remove this payment milestone. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-1 border-t border-slate-100">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost">Cancel</button>
              <button
                onClick={deleteMilestone}
                disabled={deleting}
                className="text-xs font-semibold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Milestone'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
