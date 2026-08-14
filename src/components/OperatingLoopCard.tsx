import { useState } from 'react';
import { ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';

const LOOP_STEPS = [
  { step: 'Plan', desc: 'Create project, tasks, milestones, schedule, dependencies, and assignments.' },
  { step: 'Confirm', desc: 'Confirm crew availability, material readiness, site access, permits, inspections, payment readiness, and client decisions before work starts.' },
  { step: 'Execute', desc: 'Work happens on site. Field users use Field Mode, check-in/check-out, complete tasks, upload photos, and report issues.' },
  { step: 'Update', desc: 'Submit daily updates, task status changes, inspection results, permit updates, material updates, client inputs, and communication messages.' },
  { step: 'Detect Risk', desc: 'CP360 detects delays, missing updates, blocked tasks, material issues, weather risks, permit/inspection problems, payment holds, and urgent communication.' },
  { step: 'Escalate', desc: 'Time-sensitive, critical, missing, or unresolved items move to Today\'s Action Board, Project Pulse, alerts, and Admin escalation.' },
  { step: 'Approve', desc: 'Admin approves official schedule changes, client-facing messages, work holds, project closeout, and sensitive updates.' },
  { step: 'Communicate', desc: 'CP360 creates internal updates and approved client-friendly communication through Communication Hub, notifications, and client dashboard.' },
  { step: 'Recalculate', desc: 'After approval, CP360 pushes dependent tasks, updates projected finish date, and records schedule change logs.' },
  { step: 'Report', desc: 'CP360 generates Project Pulse, daily summaries, weekly ops review, client updates, activity log, and project health reports.' },
];

export default function OperatingLoopCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-steel-950 border border-steel-800 rounded-2xl overflow-hidden mb-6">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-steel-900 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-steel-400 uppercase tracking-widest">CP360 Operating Loop</span>
          <div className="flex items-center gap-1 flex-wrap">
            {LOOP_STEPS.map((s, i) => (
              <span key={s.step} className="flex items-center gap-1">
                <span className="text-xs font-semibold text-steel-300">{s.step}</span>
                {i < LOOP_STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-steel-600" />}
              </span>
            ))}
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-steel-500 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-steel-500 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-steel-800 px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {LOOP_STEPS.map((s, i) => (
              <div key={s.step} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-steel-700 border border-steel-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-steel-300">{i + 1}</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{s.step}</p>
                  <p className="text-xs text-steel-400 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-steel-500 italic">
            "CP360 follows this loop to keep construction projects moving, prevent missed updates, catch delays early, and keep every role accountable."
          </p>
        </div>
      )}
    </div>
  );
}
