import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Search, X, ChevronDown, ExternalLink, Mail, Phone, Copy,
  Check, AlertCircle, Loader2, RefreshCw, User, Building2,
  Calendar, Tag, Inbox, Filter,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  created_at: string;
  full_name: string;
  company_name: string;
  email: string;
  phone: string;
  website: string;
  city_state: string;
  contractor_type: string;
  active_projects: string;
  biggest_challenge: string;
  preferred_time: string;
  pilot_project_notes: string;
  lead_type: string;
  source: string;
  status: string;
}

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'declined';

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  declined: 'Declined',
};

const STATUS_COLORS: Record<string, string> = {
  new:       'bg-blue-50 text-blue-700 border-blue-200',
  contacted: 'bg-amber-50 text-amber-700 border-amber-200',
  qualified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined:  'bg-slate-100 text-slate-500 border-slate-200',
};

const LEAD_TYPE_LABELS: Record<string, string> = {
  founding_pilot_application: 'Founding Pilot',
  walkthrough_request:        'Walkthrough',
};

const LEAD_TYPE_COLORS: Record<string, string> = {
  founding_pilot_application: 'bg-amber-50 text-amber-700 border-amber-200',
  walkthrough_request:        'bg-slate-100 text-slate-600 border-slate-200',
};

const CONTRACTOR_TYPES = [
  'Remodeler', 'Room Addition Contractor', 'Kitchen/Bath Remodeler',
  'Design-Build Firm', 'Deck/Porch Contractor', 'Outdoor Living Contractor',
  'Small Custom Builder', 'Other',
];
const ACTIVE_PROJECT_RANGES = ['1–2', '3–5', '6–10', '11–15', '16+'];

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_COLORS[status] ?? STATUS_COLORS.new}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function LeadTypeBadge({ leadType }: { leadType: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${LEAD_TYPE_COLORS[leadType] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {LEAD_TYPE_LABELS[leadType] ?? leadType}
    </span>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5">
      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      {message}
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function LeadDetailModal({
  lead,
  onClose,
  onStatusChange,
}: {
  lead: Lead;
  onClose: () => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
}) {
  const [copied, setCopied] = useState<'email' | 'phone' | null>(null);

  function copyToClipboard(text: string, type: 'email' | 'phone') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  const STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'declined'];
  const nextStatuses = STATUSES.filter(s => s !== lead.status);

  const Row = ({ label, value }: { label: string; value?: string }) =>
    value ? (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        <span className="text-[14px] text-slate-800 leading-snug">{value}</span>
      </div>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-slate-900/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white h-full w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LeadTypeBadge leadType={lead.lead_type} />
              <StatusBadge status={lead.status} />
            </div>
            <h2 className="text-[17px] font-bold text-slate-900 leading-tight">{lead.full_name}</h2>
            {lead.company_name && <p className="text-sm text-slate-500 mt-0.5">{lead.company_name}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors ml-3 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Contact Actions */}
          <div className="p-5 pb-0 flex items-center gap-2 flex-wrap">
            {lead.email && (
              <a
                href={`mailto:${lead.email}?subject=CP360 Walkthrough`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 px-3 py-2 rounded-lg transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Email Lead
              </a>
            )}
            {lead.email && (
              <button
                onClick={() => copyToClipboard(lead.email, 'email')}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors"
              >
                {copied === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === 'email' ? 'Copied!' : 'Copy Email'}
              </button>
            )}
            {lead.phone && (
              <button
                onClick={() => copyToClipboard(lead.phone, 'phone')}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors"
              >
                {copied === 'phone' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === 'phone' ? 'Copied!' : 'Copy Phone'}
              </button>
            )}
          </div>

          {/* Lead info */}
          <div className="p-5 space-y-5">
            <section>
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Lead Information</h3>
              <div className="grid grid-cols-1 gap-3">
                <Row label="Full Name" value={lead.full_name} />
                <Row label="Company" value={lead.company_name} />
                <Row label="Email" value={lead.email} />
                <Row label="Phone" value={lead.phone} />
                {lead.website && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Website</span>
                    <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-[14px] text-blue-600 hover:text-blue-700 flex items-center gap-1">
                      {lead.website} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                <Row label="City / State" value={lead.city_state} />
              </div>
            </section>

            <div className="h-px bg-slate-100" />

            <section>
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Lead Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Lead Type</span>
                  <LeadTypeBadge leadType={lead.lead_type} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Status</span>
                  <StatusBadge status={lead.status} />
                </div>
                <div className="col-span-2 flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Submitted</span>
                  <span className="text-[14px] text-slate-800">{fmtDateTime(lead.created_at)}</span>
                </div>
                <Row label="Contractor Type" value={lead.contractor_type} />
                <Row label="Active Projects" value={lead.active_projects} />
              </div>
              {lead.biggest_challenge && (
                <div className="mt-3">
                  <Row label="Biggest Challenge" value={lead.biggest_challenge} />
                </div>
              )}
              {lead.lead_type === 'walkthrough_request' && lead.preferred_time && (
                <div className="mt-3">
                  <Row label="Preferred Time / Availability" value={lead.preferred_time} />
                </div>
              )}
              {lead.lead_type === 'founding_pilot_application' && lead.pilot_project_notes && (
                <div className="mt-3 flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">One live project to test CP360 on</span>
                  <p className="text-[14px] text-slate-800 leading-relaxed">{lead.pilot_project_notes}</p>
                </div>
              )}
              <Row label="Source" value={lead.source} />
            </section>
          </div>
        </div>

        {/* Status actions */}
        {nextStatuses.length > 0 && (
          <div className="flex-shrink-0 border-t border-slate-100 p-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 mr-1">Mark as:</span>
            {nextStatuses.map(s => (
              <button
                key={s}
                onClick={() => onStatusChange(lead.id, s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${STATUS_COLORS[s]} hover:opacity-80`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CP360LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterLeadType, setFilterLeadType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterContractorType, setFilterContractorType] = useState('');
  const [filterActiveProjects, setFilterActiveProjects] = useState('');

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('cp360_leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (err) {
      setError('Unable to load CP360 leads. Please try again.');
      setLoading(false);
      return;
    }
    setLeads(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  async function updateStatus(id: string, status: LeadStatus) {
    const { error: err } = await supabase
      .from('cp360_leads')
      .update({ status })
      .eq('id', id);

    if (err) {
      setToast('Failed to update status.');
      return;
    }

    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    if (selectedLead?.id === id) setSelectedLead(prev => prev ? { ...prev, status } : prev);
    setToast('Lead status updated.');
  }

  // Filtered leads
  const filtered = leads.filter(l => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !l.full_name?.toLowerCase().includes(q) &&
        !l.company_name?.toLowerCase().includes(q) &&
        !l.email?.toLowerCase().includes(q) &&
        !l.phone?.includes(q)
      ) return false;
    }
    if (filterLeadType && l.lead_type !== filterLeadType) return false;
    if (filterStatus && l.status !== filterStatus) return false;
    if (filterContractorType && l.contractor_type !== filterContractorType) return false;
    if (filterActiveProjects && l.active_projects !== filterActiveProjects) return false;
    return true;
  });

  // Summary counts
  const total     = leads.length;
  const newCount  = leads.filter(l => l.status === 'new').length;
  const walkthroughs = leads.filter(l => l.lead_type === 'walkthrough_request').length;
  const applications = leads.filter(l => l.lead_type === 'founding_pilot_application').length;
  const qualified = leads.filter(l => l.status === 'qualified').length;

  const hasFilters = search || filterLeadType || filterStatus || filterContractorType || filterActiveProjects;

  const SEL = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-colors appearance-none cursor-pointer';

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-[1200px] mx-auto px-5 py-7">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">CP360 Leads</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Founding Pilot applications and walkthrough requests from the public landing page.
            </p>
          </div>
          <button
            onClick={loadLeads}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-800 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Summary Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total Leads',            value: total,        color: 'text-slate-900' },
            { label: 'New',                    value: newCount,     color: 'text-blue-700' },
            { label: 'Walkthrough Requests',   value: walkthroughs, color: 'text-slate-700' },
            { label: 'Founding Pilot Apps',    value: applications, color: 'text-amber-700' },
            { label: 'Qualified',              value: qualified,    color: 'text-emerald-700' },
          ].map(card => (
            <div key={card.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-xs text-slate-500 mt-0.5 leading-tight">{card.label}</div>
            </div>
          ))}
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filters</span>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setFilterLeadType(''); setFilterStatus(''); setFilterContractorType(''); setFilterActiveProjects(''); }}
                className="ml-auto text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, company, email, phone..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-colors"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative">
              <select value={filterLeadType} onChange={e => setFilterLeadType(e.target.value)} className={SEL + ' pr-7'}>
                <option value="">All Types</option>
                <option value="walkthrough_request">Walkthrough Request</option>
                <option value="founding_pilot_application">Founding Pilot Application</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={SEL + ' pr-7'}>
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="declined">Declined</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select value={filterContractorType} onChange={e => setFilterContractorType(e.target.value)} className={SEL + ' pr-7'}>
                <option value="">All Contractor Types</option>
                {CONTRACTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select value={filterActiveProjects} onChange={e => setFilterActiveProjects(e.target.value)} className={SEL + ' pr-7'}>
                <option value="">All Project Counts</option>
                {ACTIVE_PROJECT_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* ── Results count ────────────────────────────────────────────────── */}
        {!loading && !error && (
          <div className="text-xs text-slate-400 mb-3 px-0.5">
            {filtered.length === total
              ? `${total} lead${total !== 1 ? 's' : ''}`
              : `${filtered.length} of ${total} leads`}
          </div>
        )}

        {/* ── Loading ──────────────────────────────────────────────────────── */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading CP360 leads...</p>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">{error}</p>
              <button onClick={loadLeads} className="text-xs text-red-600 underline mt-1 hover:text-red-700">Try again</button>
            </div>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Inbox className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">
              {hasFilters ? 'No leads match your filters.' : 'No CP360 leads yet.'}
            </p>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setFilterLeadType(''); setFilterStatus(''); setFilterContractorType(''); setFilterActiveProjects(''); }}
                className="text-xs text-amber-600 hover:text-amber-700 mt-1"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* ── Desktop Table ────────────────────────────────────────────────── */}
        {!loading && !error && filtered.length > 0 && (
          <>
            <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              {/* Scroll hint */}
              <div className="flex items-center justify-end gap-1.5 px-5 py-2 border-b border-slate-50 bg-slate-50/60">
                <span className="text-[11px] text-slate-400">Scroll right to see all columns</span>
                <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </div>
              {/* Horizontal scroll wrapper */}
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ minWidth: '1100px', width: '100%' }}>
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-4 py-3 pl-5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Submitted</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Type</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Name</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Company</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Email</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Phone</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Projects</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Challenge</th>
                      <th
                        className="text-left px-4 py-3 pr-5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-white"
                        style={{ position: 'sticky', right: 0, boxShadow: '-4px 0 8px -2px rgba(0,0,0,0.06)', zIndex: 10 }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(lead => (
                      <tr key={lead.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 pl-5 whitespace-nowrap text-[12px] text-slate-500">{fmtDate(lead.created_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><LeadTypeBadge leadType={lead.lead_type} /></td>
                        <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={lead.status} /></td>
                        <td className="px-4 py-3 text-[13px] font-medium text-slate-900 whitespace-nowrap" style={{ maxWidth: 140 }}>
                          <div className="truncate" title={lead.full_name}>{lead.full_name}</div>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600" style={{ maxWidth: 140 }}>
                          <div className="truncate whitespace-nowrap" title={lead.company_name || undefined}>{lead.company_name || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600" style={{ maxWidth: 170 }}>
                          <div className="truncate whitespace-nowrap" title={lead.email || undefined}>
                            {lead.email
                              ? <a href={`mailto:${lead.email}`} className="hover:text-slate-900 hover:underline transition-colors">{lead.email}</a>
                              : '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap">{lead.phone || '—'}</td>
                        <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap text-center">{lead.active_projects || '—'}</td>
                        <td className="px-4 py-3 text-[13px] text-slate-600" style={{ maxWidth: 220 }}>
                          <div className="truncate whitespace-nowrap" title={lead.biggest_challenge || undefined}>{lead.biggest_challenge || '—'}</div>
                        </td>
                        <td
                          className="px-4 py-3 pr-5 whitespace-nowrap bg-white"
                          style={{ position: 'sticky', right: 0, boxShadow: '-4px 0 8px -2px rgba(0,0,0,0.06)', zIndex: 10 }}
                        >
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSelectedLead(lead)}
                              className="text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                            >
                              View
                            </button>
                            {lead.status !== 'contacted' && (
                              <button
                                onClick={() => updateStatus(lead.id, 'contacted')}
                                className="text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg transition-colors"
                              >
                                Contacted
                              </button>
                            )}
                            {lead.status !== 'qualified' && (
                              <button
                                onClick={() => updateStatus(lead.id, 'qualified')}
                                className="text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1.5 rounded-lg transition-colors"
                              >
                                Qualified
                              </button>
                            )}
                            {lead.status !== 'declined' && (
                              <button
                                onClick={() => updateStatus(lead.id, 'declined')}
                                className="text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                              >
                                Decline
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Mobile Cards ─────────────────────────────────────────────── */}
            <div className="md:hidden space-y-3">
              {filtered.map(lead => (
                <div key={lead.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-[15px] leading-tight truncate">{lead.full_name}</p>
                      {lead.company_name && <p className="text-sm text-slate-500 mt-0.5 truncate">{lead.company_name}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <LeadTypeBadge leadType={lead.lead_type} />
                      <StatusBadge status={lead.status} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3 text-[13px]">
                    <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{fmtDate(lead.created_at)}</span>
                    </div>
                    {lead.email && (
                      <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                        <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{lead.email}</span>
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
                        <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{lead.phone}</span>
                      </div>
                    )}
                    {lead.biggest_challenge && (
                      <div className="col-span-2 flex items-start gap-1.5 text-slate-600 min-w-0">
                        <Tag className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                        <span className="truncate">{lead.biggest_challenge}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setSelectedLead(lead)}
                      className="text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      View Details
                    </button>
                    {lead.status !== 'contacted' && (
                      <button
                        onClick={() => updateStatus(lead.id, 'contacted')}
                        className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Mark Contacted
                      </button>
                    )}
                    {lead.status !== 'qualified' && (
                      <button
                        onClick={() => updateStatus(lead.id, 'qualified')}
                        className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Mark Qualified
                      </button>
                    )}
                    {lead.status !== 'declined' && (
                      <button
                        onClick={() => updateStatus(lead.id, 'declined')}
                        className="text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Decline
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Detail Panel ──────────────────────────────────────────────────── */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={updateStatus}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}
