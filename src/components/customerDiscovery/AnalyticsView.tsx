import { useState, useMemo } from 'react';
import { TrendingUp, AlertTriangle, HelpCircle, Package, DollarSign, Star, PieChart, Monitor } from 'lucide-react';
import type { DiscoverySession, FeatureRequest } from './types';
import { OUTCOMES, CURRENT_SOFTWARE_OPTIONS, PURCHASE_READINESS_OPTIONS, EXPECTED_PRICE_OPTIONS, PRODUCT_AREAS, SIGNAL_STATUSES } from './types';
import { fmtDate, daysUntil } from './ui';

type DateRange = '30d' | '90d' | 'year' | 'all';

function inRange(session: DiscoverySession, range: DateRange): boolean {
  if (range === 'all') return true;
  if (!session.demo_date) return false;
  const d = new Date(session.demo_date);
  const now = new Date();
  if (range === '30d') return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 30;
  if (range === '90d') return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 90;
  if (range === 'year') return d.getFullYear() === now.getFullYear();
  return true;
}

function countBy(sessions: DiscoverySession[], field: keyof DiscoverySession): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    const v = s[field] as string;
    if (!v) continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

function HorizontalBarChart({ data, max }: { data: { label: string; count: number }[]; max?: number }) {
  const maxVal = max ?? Math.max(...data.map(d => d.count), 1);
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">No data available.</p>;
  }
  return (
    <div className="space-y-2">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-32 text-xs text-slate-600 truncate flex-shrink-0" title={d.label}>{d.label}</div>
          <div className="flex-1 bg-slate-100 rounded-full h-5 relative overflow-hidden">
            <div
              className="bg-amber-400 h-full rounded-full transition-all"
              style={{ width: `${(d.count / maxVal) * 100}%` }}
            />
          </div>
          <div className="w-8 text-xs font-semibold text-slate-700 text-right flex-shrink-0">{d.count}</div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsView({ sessions }: { sessions: DiscoverySession[] }) {
  const [range, setRange] = useState<DateRange>('all');

  const filtered = useMemo(() => {
    return sessions.filter(s => !s.archived_at && inRange(s, range));
  }, [sessions, range]);

  // Most Valuable Features (from valuable_feature text — simple keyword match)
  const valuableCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of filtered) {
      const v = s.valuable_feature?.toLowerCase() ?? '';
      for (const area of PRODUCT_AREAS) {
        if (v.includes(area.toLowerCase())) {
          counts[area] = (counts[area] ?? 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered]);

  // Most Confusing Areas (from main_frustration)
  const confusingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of filtered) {
      const v = s.main_frustration?.toLowerCase() ?? '';
      for (const area of PRODUCT_AREAS) {
        if (v.includes(area.toLowerCase())) {
          counts[area] = (counts[area] ?? 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered]);

  // Common Missing Expectations (from missing_information — grouped by keyword)
  const missingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of filtered) {
      const v = s.missing_information?.toLowerCase() ?? '';
      for (const area of PRODUCT_AREAS) {
        if (v.includes(area.toLowerCase())) {
          counts[area] = (counts[area] ?? 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered]);

  // Outcome distribution
  const outcomeData = useMemo(() => {
    const counts = countBy(filtered, 'outcome');
    return OUTCOMES.map(o => ({ label: o, count: counts[o] ?? 0 }));
  }, [filtered]);

  // Purchase readiness
  const readinessData = useMemo(() => {
    const counts = countBy(filtered, 'purchase_readiness');
    return PURCHASE_READINESS_OPTIONS.map(o => ({ label: o, count: counts[o] ?? 0 }));
  }, [filtered]);

  // Expected price
  const priceData = useMemo(() => {
    const counts = countBy(filtered, 'expected_monthly_price');
    return EXPECTED_PRICE_OPTIONS.map(o => ({ label: o, count: counts[o] ?? 0 }));
  }, [filtered]);

  // Current software
  const softwareData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of filtered) {
      for (const sw of s.current_software) {
        counts[sw] = (counts[sw] ?? 0) + 1;
      }
    }
    return CURRENT_SOFTWARE_OPTIONS.map(o => ({ label: o, count: counts[o] ?? 0 }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Average usability rating
  const avgRating = useMemo(() => {
    const rated = filtered.filter(s => s.overall_rating > 0);
    return rated.length > 0
      ? (rated.reduce((sum, s) => sum + s.overall_rating, 0) / rated.length).toFixed(1)
      : '—';
  }, [filtered]);

  // Repeated signals — items mentioned by at least 2 customers
  const repeatedSignals = useMemo(() => {
    // Combine valuable_feature, main_frustration, missing_information, feature_requests
    const signalMap = new Map<string, { signal: string; category: string; companies: Set<string> }>();

    for (const s of filtered) {
      const company = s.company_name || 'Unknown';
      // valuable features
      if (s.valuable_feature) {
        for (const area of PRODUCT_AREAS) {
          if (s.valuable_feature.toLowerCase().includes(area.toLowerCase())) {
            const key = `valuable:${area}`;
            if (!signalMap.has(key)) signalMap.set(key, { signal: area, category: 'Valuable Feature', companies: new Set() });
            signalMap.get(key)!.companies.add(company);
          }
        }
      }
      // frustrations
      if (s.main_frustration) {
        for (const area of PRODUCT_AREAS) {
          if (s.main_frustration.toLowerCase().includes(area.toLowerCase())) {
            const key = `frustration:${area}`;
            if (!signalMap.has(key)) signalMap.set(key, { signal: area, category: 'Friction', companies: new Set() });
            signalMap.get(key)!.companies.add(company);
          }
        }
      }
      // missing
      if (s.missing_information) {
        for (const area of PRODUCT_AREAS) {
          if (s.missing_information.toLowerCase().includes(area.toLowerCase())) {
            const key = `missing:${area}`;
            if (!signalMap.has(key)) signalMap.set(key, { signal: area, category: 'Missing Expectation', companies: new Set() });
            signalMap.get(key)!.companies.add(company);
          }
        }
      }
    }

    return Array.from(signalMap.values())
      .filter(sig => sig.companies.size >= 2)
      .map(sig => ({
        signal: sig.signal,
        category: sig.category,
        mentions: sig.companies.size,
        companies: Array.from(sig.companies),
        status: 'Reviewing' as string,
      }))
      .sort((a, b) => b.mentions - a.mentions);
  }, [filtered]);

  const RANGE_OPTIONS: { id: DateRange; label: string }[] = [
    { id: '30d', label: 'Last 30 Days' },
    { id: '90d', label: 'Last 90 Days' },
    { id: 'year', label: 'This Year' },
    { id: 'all', label: 'All Time' },
  ];

  return (
    <div className="space-y-5">
      {/* Date range filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date Range:</span>
        {RANGE_OPTIONS.map(o => (
          <button
            key={o.id}
            onClick={() => setRange(o.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              range === o.id
                ? 'bg-amber-50 text-amber-700 border-amber-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} session{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <Star className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px] text-slate-500">Avg Usability</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{avgRating}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <PieChart className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] text-slate-500">Total Sessions</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{filtered.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px] text-slate-500">Strong Interest</span>
          </div>
          <div className="text-xl font-bold text-emerald-700">{filtered.filter(s => s.outcome === 'Strong Interest').length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px] text-slate-500">Repeated Signals</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{repeatedSignals.length}</div>
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-900">Most Valuable Features</h3>
          </div>
          <HorizontalBarChart data={valuableCounts} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">Most Confusing Areas</h3>
          </div>
          <HorizontalBarChart data={confusingCounts} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-bold text-slate-900">Common Missing Expectations</h3>
          </div>
          <HorizontalBarChart data={missingCounts} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Demo Outcome Distribution</h3>
          </div>
          <HorizontalBarChart data={outcomeData} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-900">Purchase Readiness</h3>
          </div>
          <HorizontalBarChart data={readinessData} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">Expected Monthly Price</h3>
          </div>
          <HorizontalBarChart data={priceData} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Current Software Distribution</h3>
          </div>
          <HorizontalBarChart data={softwareData} />
        </div>
      </div>

      {/* Repeated Signals */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-900">Repeated Signals</h3>
          <span className="text-xs text-slate-400 ml-2">Mentioned by 2+ customers</span>
        </div>
        {repeatedSignals.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No repeated signals yet. Capture more demo sessions to surface patterns.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm w-full" style={{ minWidth: '600px' }}>
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Signal</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mentions</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Supporting Companies</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {repeatedSignals.map((sig, i) => (
                  <tr key={`${sig.signal}-${sig.category}`} className="hover:bg-slate-50/60">
                    <td className="px-3 py-3 text-[13px] font-medium text-slate-900">{sig.signal}</td>
                    <td className="px-3 py-3 text-[13px] text-slate-600">{sig.category}</td>
                    <td className="px-3 py-3 text-[13px] text-slate-600">{sig.mentions}</td>
                    <td className="px-3 py-3 text-[13px] text-slate-600">
                      <div className="flex flex-wrap gap-1">
                        {sig.companies.map(c => (
                          <span key={c} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-slate-100 text-slate-600 border-slate-200">
                        {sig.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          Repeated signals do not automatically change the product roadmap.
        </p>
      </div>
    </div>
  );
}
