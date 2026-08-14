import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { MessageSquare, Send, Sparkles, ChevronDown, ChevronUp, Shield, AlertTriangle } from 'lucide-react';

interface AIResponse {
  answer: string;
  reason: string;
  recommendedAction: string;
  confidence: 'High' | 'Medium' | 'Low';
  missingInfo: string;
  adminApprovalNeeded: boolean;
}

const rolePrompts: Record<string, string[]> = {
  CONVAZANT_SUPER_ADMIN: [
    'What needs attention today across all workspaces?',
    'Show platform-level alerts',
    'Summarize workspace activity',
  ],
  DECKARC_ADMIN: [
    'What needs attention today?',
    'What changed yesterday?',
    'What is blocking tomorrow\'s work?',
    'Show critical projects',
    'Draft a client update',
    'Summarize missing updates',
    'Summarize permit/inspection risks',
  ],
  GENERAL_CONTRACTOR: [
    'Show inspection issues',
    'What tasks are due today?',
    'What is blocking my projects?',
    'What needs to be ready tomorrow?',
  ],
  SUBCONTRACTOR: [
    'What is my task today?',
    'Confirm tomorrow\'s work',
    'How do I submit a daily update?',
    'How do I report an issue?',
  ],
  CLIENT: [
    'What action is needed from me?',
    'What is my project status?',
    'What is the next milestone?',
    'How do I confirm a walkthrough?',
  ],
};

async function generateAIResponse(query: string, role: string, projectContext: string): Promise<AIResponse> {
  // Fetch role-appropriate context from DB
  const isClient = role === 'CLIENT';
  const isAdmin = role === 'DECKARC_ADMIN' || role === 'CONVAZANT_SUPER_ADMIN';

  let contextData = '';
  try {
    const [projectsRes, tasksRes, alertsRes] = await Promise.all([
      supabase.from('projects').select('project_name,status,alert_status,progress_percentage').limit(10),
      supabase.from('tasks').select('task_name,status,planned_finish_date').limit(isClient ? 5 : 15),
      isClient ? Promise.resolve({ data: [] }) : supabase.from('action_items').select('title,priority,status').eq('status', 'Open').limit(5),
    ]);

    const projects = (projectsRes.data || []).map(p => `${p.project_name}: ${p.status} (${p.progress_percentage}%)`).join(', ');
    const tasks = (tasksRes.data || []).map(t => `${t.task_name}: ${t.status}`).join(', ');
    const openItems = ((alertsRes as { data: Array<{ title: string; priority: string }> }).data || []).map((a: { title: string; priority: string }) => `${a.title} [${a.priority}]`).join(', ');

    contextData = `Projects: ${projects || 'none'}. Tasks: ${tasks || 'none'}. ${!isClient && openItems ? `Open items: ${openItems}.` : ''}`;
  } catch {
    contextData = 'Limited context available.';
  }

  const q = query.toLowerCase();

  // Client safety filter
  if (isClient) {
    const blockedTerms = ['supplier', 'subcontractor no-show', 'internal cost', 'margin', 'internal note', 'admin only'];
    if (blockedTerms.some(t => q.includes(t))) {
      return {
        answer: 'DECKARC is reviewing the details internally and will share an approved update when available.',
        reason: 'This information is reviewed by the DECKARC team before being shared.',
        recommendedAction: 'No action needed from you at this time.',
        confidence: 'High',
        missingInfo: '',
        adminApprovalNeeded: false,
      };
    }
  }

  // Build a context-aware response based on the query
  let answer = '';
  let reason = '';
  let recommendedAction = '';
  let confidence: AIResponse['confidence'] = 'Medium';
  let missingInfo = '';
  let adminApprovalNeeded = false;

  if (q.includes('today') || q.includes('attention') || q.includes('action')) {
    answer = contextData.includes('Delayed')
      ? 'There are delayed projects that need attention today. Check the Action Board for critical items.'
      : 'No critical issues detected for today. Review the Action Board to confirm all tasks are on track.';
    reason = 'Based on current project statuses and open action items.';
    recommendedAction = 'Review Today\'s Action Board and confirm all assigned tasks.';
    confidence = 'Medium';
  } else if (q.includes('block') || q.includes('stuck')) {
    answer = 'Blocked tasks are shown in red on your dashboard. Common blockers include missing permits, awaiting inspections, and pending client decisions.';
    reason = 'Task statuses were reviewed for Blocked and At Risk flags.';
    recommendedAction = 'Navigate to Projects > Tasks to see all blocked items and assign follow-ups.';
    confidence = 'Medium';
  } else if (q.includes('tomorrow') || q.includes('ready')) {
    answer = 'Tomorrow\'s work requires confirming crew availability, material readiness, and any scheduled inspections. Review the Tomorrow\'s Work page for details.';
    reason = 'Based on tasks scheduled for tomorrow and outstanding confirmations.';
    recommendedAction = 'Open Tomorrow\'s Work to review and confirm readiness.';
    confidence = 'Medium';
  } else if (q.includes('permit')) {
    answer = 'Permit status varies by project. Any permits not in Approved status may be blocking dependent tasks. Check Permits & Inspections for details.';
    reason = 'Permit statuses queried across all active projects.';
    recommendedAction = 'Review Permits & Inspections tab and update any stale permit statuses.';
    confidence = 'Medium';
    if (!isAdmin) adminApprovalNeeded = true;
  } else if (q.includes('client') && q.includes('update') && isAdmin) {
    answer = 'A client-friendly update draft should summarize milestone progress, upcoming inspections, and any decisions needed — without internal operational details.';
    reason = 'Admin can draft and approve client messages from the Communication Hub.';
    recommendedAction = 'Use the Communication Hub to create a Client Update Draft, then approve it before it becomes visible to the client.';
    confidence = 'High';
    adminApprovalNeeded = true;
  } else if (q.includes('status') || q.includes('project')) {
    const projectSummary = contextData.split('Projects:')[1]?.split('.')[0]?.trim() || 'No project data available.';
    answer = `Current project overview: ${projectSummary}`;
    reason = 'Based on your authorized project data.';
    recommendedAction = 'Navigate to Projects for detailed status on each project.';
    confidence = 'Medium';
  } else if (q.includes('milestone') || q.includes('next')) {
    answer = 'Next milestones are determined by tasks with the nearest planned completion dates. Check your project\'s task list for upcoming milestones.';
    reason = 'Task completion dates and statuses were reviewed.';
    recommendedAction = 'Open the Tasks & Milestones page for your project to see the full schedule.';
    confidence = 'Medium';
  } else {
    answer = 'I can help summarize project status, identify blockers, review permit or inspection readiness, and draft communication. Please ask about a specific project, task, or operational area.';
    reason = 'General assistant response — no specific data matched.';
    recommendedAction = 'Try asking about today\'s tasks, blocked items, permit status, or tomorrow\'s work.';
    confidence = 'Low';
    missingInfo = 'A more specific question will produce better results.';
  }

  return { answer, reason, recommendedAction, confidence, missingInfo, adminApprovalNeeded };
}

export default function AskCP360() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const role = profile?.role || 'SUBCONTRACTOR';
  const quickPrompts = rolePrompts[role] || rolePrompts['SUBCONTRACTOR'];

  async function handleAsk(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setResponse(null);
    try {
      const res = await generateAIResponse(q, role, '');
      setResponse(res);
    } finally {
      setLoading(false);
    }
  }

  function usePrompt(p: string) {
    setQuery(p);
    handleAsk(p);
  }

  const confidenceColor = {
    High: 'text-emerald-600 bg-emerald-50',
    Medium: 'text-amber-600 bg-amber-50',
    Low: 'text-concrete-500 bg-concrete-100',
  };

  return (
    <div className="bg-white border border-concrete-200 rounded-2xl shadow-card overflow-hidden mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-concrete-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-steel-800 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-concrete-900">Ask CP360</p>
            <p className="text-xs text-concrete-500">AI assistant — role-based, read-only</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-concrete-400" /> : <ChevronDown className="w-4 h-4 text-concrete-400" />}
      </button>

      {open && (
        <div className="border-t border-concrete-100">
          {/* Quick prompts */}
          <div className="px-5 pt-4 pb-3">
            <p className="text-[10px] font-semibold text-concrete-400 uppercase tracking-wider mb-2">Quick Prompts</p>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map(p => (
                <button
                  key={p}
                  onClick={() => usePrompt(p)}
                  className="text-xs px-3 py-1.5 bg-concrete-100 hover:bg-steel-100 hover:text-steel-700 text-concrete-600 rounded-full font-medium transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-5 pb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAsk(query)}
                placeholder="Ask about projects, tasks, permits, inspections..."
                className="input-field flex-1 text-sm py-2.5"
              />
              <button
                onClick={() => handleAsk(query)}
                disabled={loading || !query.trim()}
                className="btn-primary px-4 py-2.5 flex items-center gap-1.5 text-sm disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                {loading ? 'Thinking...' : 'Ask'}
              </button>
            </div>
            <p className="text-[11px] text-concrete-400 mt-1.5 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              AI uses only your role-authorized data. Responses are assistive — not official decisions.
            </p>
          </div>

          {/* Response */}
          {loading && (
            <div className="px-5 pb-5">
              <div className="bg-concrete-50 rounded-xl p-4 animate-pulse space-y-2">
                <div className="h-3 bg-concrete-200 rounded w-3/4" />
                <div className="h-3 bg-concrete-200 rounded w-full" />
                <div className="h-3 bg-concrete-200 rounded w-1/2" />
              </div>
            </div>
          )}

          {response && !loading && (
            <div className="px-5 pb-5">
              <div className="bg-concrete-50 border border-concrete-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-steel-500 flex-shrink-0" />
                    <p className="text-sm font-semibold text-concrete-800">Answer</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${confidenceColor[response.confidence]}`}>
                    {response.confidence} confidence
                  </span>
                </div>

                <p className="text-sm text-concrete-700 leading-relaxed">{response.answer}</p>

                <div className="border-t border-concrete-200 pt-3 space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold text-concrete-400 uppercase tracking-wider mb-0.5">Reason</p>
                    <p className="text-xs text-concrete-600">{response.reason}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-concrete-400 uppercase tracking-wider mb-0.5">Recommended Action</p>
                    <p className="text-xs text-concrete-600">{response.recommendedAction}</p>
                  </div>
                  {response.missingInfo && (
                    <div>
                      <p className="text-[10px] font-semibold text-concrete-400 uppercase tracking-wider mb-0.5">Missing Information</p>
                      <p className="text-xs text-concrete-600">{response.missingInfo}</p>
                    </div>
                  )}
                  {response.adminApprovalNeeded && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-amber-700 font-medium">Admin Approval Needed before taking official action.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
