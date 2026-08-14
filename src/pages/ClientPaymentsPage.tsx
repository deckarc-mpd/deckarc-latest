import { useEffect, useState } from 'react';
import { CreditCard, CheckCircle, Clock, AlertTriangle, Search, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { normalizePaymentStatus } from '../components/project/PaymentsTab';

interface PaymentMilestone {
  id: string;
  project_id: string;
  milestone_name: string;
  amount: number;
  due_date: string | null;
  paid_date: string | null;
  status: string;
  project?: { project_name: string };
}

type StatusFilter = 'all' | 'Paid' | 'Due' | 'Upcoming' | 'Overdue' | 'Pending';

const STATUS_CFG: Record<string, { pill: string; icon: typeof CheckCircle; iconColor: string }> = {
  Paid:     { pill: 'bg-green-50 text-green-700 border-green-200',    icon: CheckCircle,   iconColor: 'text-green-500'  },
  Due:      { pill: 'bg-steel-800 text-white border-steel-800',       icon: Clock,         iconColor: 'text-blue-600'   },
  Upcoming: { pill: 'bg-slate-100 text-slate-500 border-slate-200',   icon: Clock,         iconColor: 'text-slate-400'  },
  Overdue:  { pill: 'bg-red-50 text-red-700 border-red-200',          icon: AlertTriangle, iconColor: 'text-red-500'    },
  Pending:  { pill: 'bg-amber-50 text-amber-700 border-amber-200',    icon: Clock,         iconColor: 'text-amber-500'  },
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClientPaymentsPage() {
  const { profile } = useAuth();
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  useEffect(() => {
    if (!profile) return;
    load();
  }, [profile]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_milestones')
      .select('id, project_id, milestone_name, amount, due_date, paid_date, status, projects(project_name)')
      .order('due_date', { ascending: true });

    if (!error && data) {
      setMilestones((data as any[]).map(m => ({ ...m, project: m.projects })));
    }
    setLoading(false);
  }

  const projects = Array.from(new Map(milestones.map(m => [m.project_id, m.project?.project_name || 'Project'])).entries());

  const filtered = milestones.filter(m => {
    const q = search.trim().toLowerCase();
    const matchQ = !q || m.milestone_name.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || normalizePaymentStatus(m.status) === statusFilter;
    const matchProject = projectFilter === 'all' || m.project_id === projectFilter;
    return matchQ && matchStatus && matchProject;
  });

  const totalContract = milestones.reduce((s, m) => s + (m.amount || 0), 0);
  const totalPaid = milestones.filter(m => normalizePaymentStatus(m.status) === 'Paid').reduce((s, m) => s + (m.amount || 0), 0);
  const pctPaid = totalContract > 0 ? Math.round((totalPaid / totalContract) * 100) : 0;
  const dueNow = milestones.find(m => normalizePaymentStatus(m.status) === 'Due' || normalizePaymentStatus(m.status) === 'Overdue');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 h-14 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-steel-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">Payments</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-6 space-y-5">

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading payment schedule...</span>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            {milestones.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Contract Total',  value: `$${totalContract.toLocaleString()}`, sub: 'Full project amount' },
                    { label: 'Amount Paid',      value: `$${totalPaid.toLocaleString()}`,     sub: `${pctPaid}% of total` },
                    { label: 'Remaining',        value: `$${(totalContract - totalPaid).toLocaleString()}`, sub: 'Balance due' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                      <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600">Payment Progress</p>
                    <p className="text-xs text-slate-500">{pctPaid}% paid</p>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pctPaid}%` }} />
                  </div>
                </div>

                {dueNow && (
                  <div className="rounded-xl px-5 py-4 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, #0d1e36 0%, #1e3f6e 100%)', boxShadow: '0 4px 20px rgba(13,30,54,0.25)' }}>
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                        {dueNow.status === 'Overdue' ? 'Payment Overdue' : 'Payment Due'}
                      </p>
                      <p className="text-sm font-bold text-white truncate">{dueNow.milestone_name}</p>
                      <p className="text-xs text-slate-300 mt-0.5">
                        ${(dueNow.amount || 0).toLocaleString()} · Due {fmtDate(dueNow.due_date)}
                        {dueNow.project?.project_name && ` · ${dueNow.project.project_name}`}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Payment schedule table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">Payment Schedule</h2>
              </div>

              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-wrap">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search milestones..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400"
                  />
                </div>
                {projects.length > 1 && (
                  <select
                    value={projectFilter}
                    onChange={e => setProjectFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-600"
                  >
                    <option value="all">All Projects</option>
                    {projects.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                )}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-600"
                >
                  <option value="all">All Statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Due">Due</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

              {milestones.length === 0 ? (
                <div className="py-16 text-center">
                  <CreditCard className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">No payment schedule yet</p>
                  <p className="text-xs text-slate-400 mt-1">Your payment schedule will appear here once set up.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="pl-5 pr-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Milestone</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Amount</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Due Date</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Date Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={5} className="py-10 text-center text-xs text-slate-400">No payments match your search.</td></tr>
                      ) : filtered.map(m => {
                        const statusKey = normalizePaymentStatus(m.status);
                        const cfg = STATUS_CFG[statusKey] ?? STATUS_CFG['Upcoming'];
                        const Icon = cfg.icon;
                        return (
                          <tr key={m.id} className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors ${statusKey === 'Due' ? 'bg-slate-50' : ''}`}>
                            <td className="pl-5 pr-3 py-3.5 whitespace-nowrap align-middle">
                              <div className="flex items-center gap-1.5">
                                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.iconColor}`} />
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                                  {statusKey}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3.5 align-middle">
                              <p className="text-sm font-medium text-slate-800">{m.milestone_name}</p>
                              {m.project?.project_name && projects.length > 1 && (
                                <p className="text-[10px] text-slate-400 mt-0.5">{m.project.project_name}</p>
                              )}
                            </td>
                            <td className="px-3 py-3.5 align-middle text-right whitespace-nowrap">
                              <span className="text-sm font-bold text-slate-900">${(m.amount || 0).toLocaleString()}</span>
                            </td>
                            <td className="px-3 py-3.5 align-middle whitespace-nowrap hidden sm:table-cell">
                              <span className={`text-xs ${statusKey === 'Overdue' ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                {fmtDate(m.due_date)}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 align-middle whitespace-nowrap hidden sm:table-cell">
                              {m.paid_date
                                ? <span className="text-xs text-green-600 font-medium">{fmtDate(m.paid_date)}</span>
                                : <span className="text-xs text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        <p className="text-center text-xs text-slate-400 pb-2">
          Payment schedule managed by your DECKARC project coordinator.
        </p>
      </div>
    </div>
  );
}
