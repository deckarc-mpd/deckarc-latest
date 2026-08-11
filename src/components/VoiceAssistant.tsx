import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Mic, MicOff, X, Volume2, VolumeX, Loader2, Bot, Send, Radio, Repeat } from 'lucide-react';
import VoiceOrb from './VoiceOrb';

// Only this account sees / can use the voice assistant.
const ADMIN_EMAIL = 'deckarc.admin@test.com';

type OrbStatus = 'idle' | 'listening' | 'speaking';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

// Decorative feature spokes (left / right), like the reference UI.
const LEFT_SPOKES = [
  'Project Status',
  'What Needs Attention',
  'Daily Updates',
  'Permits & Inspections',
  'Change Orders',
  'Schedule Risks',
  'Client Messages',
  'Payments',
];
const RIGHT_SPOKES = [
  'Add Task',
  'Draft Client Update',
  'Tomorrow\u2019s Work',
  'Open Action Items',
  'Punch List',
  'Reports',
  'Weather Risks',
  'Team & Crews',
];

// Minimal typings for the Web Speech API (not in TS DOM lib by default).
type SpeechRecognitionResultLike = { transcript: string };
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

async function fetchLiveContext(): Promise<string> {
  try {
    const [projectsRes, tasksRes, alertsRes] = await Promise.all([
      supabase.from('projects').select('project_name,status,progress_percentage').limit(10),
      supabase.from('tasks').select('task_name,status,planned_finish_date').limit(15),
      supabase.from('action_items').select('title,priority,status').eq('status', 'Open').limit(5),
    ]);
    const projects = (projectsRes.data || [])
      .map((p) => `${p.project_name}: ${p.status} (${p.progress_percentage}%)`)
      .join(', ');
    const tasks = (tasksRes.data || [])
      .map((t) => `${t.task_name}: ${t.status}`)
      .join(', ');
    const openItems = (alertsRes.data || [])
      .map((a: { title: string; priority: string }) => `${a.title} [${a.priority}]`)
      .join(', ');
    return `Projects: ${projects || 'none'}. Tasks: ${tasks || 'none'}. Open action items: ${openItems || 'none'}.`;
  } catch {
    return 'Limited live context available.';
  }
}

// ── Data tools: run the AI's chosen read query against Supabase ─────────────
// Returns compact rows the model turns into a spoken answer. Errors are returned
// as a shape the model can gracefully explain rather than throwing.
async function executeDataTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    if (name === 'query_projects') {
      let q = supabase
        .from('projects')
        .select('project_name,status,alert_status,progress_percentage')
        .limit(50);
      const health = String(args.health || 'all');
      if (health === 'at_risk') q = q.eq('alert_status', 'yellow');
      else if (health === 'delayed') q = q.eq('alert_status', 'red');
      else if (health === 'on_track') q = q.eq('alert_status', 'green');
      if (typeof args.name_contains === 'string' && args.name_contains.trim()) {
        q = q.ilike('project_name', `%${args.name_contains.trim()}%`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length || 0, projects: data || [] };
    }

    if (name === 'query_tasks') {
      let q = supabase
        .from('tasks')
        .select('task_name,status,planned_finish_date')
        .limit(60);
      const status = String(args.status || 'all');
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length || 0, tasks: data || [] };
    }

    if (name === 'query_action_items') {
      let q = supabase
        .from('action_items')
        .select('title,priority,status')
        .eq('status', 'Open')
        .limit(40);
      const priority = String(args.priority || 'all');
      if (priority !== 'all') q = q.eq('priority', priority);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length || 0, action_items: data || [] };
    }

    if (name === 'query_permits') {
      const { data, error } = await supabase
        .from('permits')
        .select('permit_type,permit_number,permit_status,jurisdiction')
        .limit(50);
      if (error) return { error: error.message };
      let rows = data || [];
      if (args.pending_only === true) {
        rows = rows.filter(
          (r: { permit_status?: string }) =>
            (r.permit_status || '').toLowerCase() !== 'approved'
        );
      }
      return { count: rows.length, permits: rows };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Query failed.' };
  }
}

// ── Write tools: run ONLY after the user has confirmed ─────────────────────
async function executeWriteTool(
  name: string,
  args: Record<string, unknown>,
  organizationId: string | null
): Promise<{ ok: boolean; message: string }> {
  try {
    if (name === 'create_project') {
      const project_name = String(args.project_name || '').trim();
      const client_name = String(args.client_name || '').trim();
      if (!project_name || !client_name) {
        return { ok: false, message: 'A project name and client name are both required.' };
      }
      const { error } = await supabase.from('projects').insert({
        project_name,
        client_name,
        project_type: args.project_type ? String(args.project_type) : '',
        description: args.description ? String(args.description) : '',
        status: 'Planning',
        progress_percentage: 0,
        organization_id: organizationId,
      });
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: `Created project ${project_name} for ${client_name}.` };
    }

    if (name === 'update_task_status') {
      const task_name = String(args.task_name || '').trim();
      const new_status = String(args.new_status || '').trim();
      if (!task_name || !new_status) {
        return { ok: false, message: 'A task name and new status are required.' };
      }
      // Find the task by (partial) name first.
      const { data: matches, error: findErr } = await supabase
        .from('tasks')
        .select('id,task_name')
        .ilike('task_name', `%${task_name}%`)
        .limit(5);
      if (findErr) return { ok: false, message: findErr.message };
      if (!matches || matches.length === 0) {
        return { ok: false, message: `I couldn't find a task matching “${task_name}”.` };
      }
      if (matches.length > 1) {
        const names = matches.map((m) => m.task_name).slice(0, 3).join(', ');
        return {
          ok: false,
          message: `Several tasks match “${task_name}” (${names}). Please be more specific.`,
        };
      }
      const { error: updErr } = await supabase
        .from('tasks')
        .update({ status: new_status })
        .eq('id', matches[0].id);
      if (updErr) return { ok: false, message: updErr.message };
      return { ok: true, message: `Set ${matches[0].task_name} to ${new_status}.` };
    }

    return { ok: false, message: `Unknown action: ${name}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Action failed.' };
  }
}

// Small animated waveform strip shown while listening / speaking.
function Waveform({ active }: { active: boolean }) {
  const bars = 28;
  return (
    <div className="flex items-end justify-center gap-[3px] h-8">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-cyan-400/80"
          style={{
            height: active ? undefined : '4px',
            animation: active
              ? `orbWave 900ms ease-in-out ${(i % 7) * 90}ms infinite`
              : 'none',
          }}
        />
      ))}
    </div>
  );
}

interface VoiceAssistantProps {
  // Called when the agent decides to navigate to a platform page.
  onNavigate?: (page: string) => void;
}

export default function VoiceAssistant({ onNavigate }: VoiceAssistantProps) {
  const { profile } = useAuth();
  const isAdmin = profile?.email?.toLowerCase() === ADMIN_EMAIL;

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  // A write the agent proposed that is awaiting the user's explicit approval.
  const [pendingConfirm, setPendingConfirm] = useState<
    { name: string; args: Record<string, unknown>; prompt: string } | null
  >(null);
  const [supported, setSupported] = useState(true);
  // Phase 4: hands-free options.
  const [wakeEnabled, setWakeEnabled] = useState(false); // "wake up" always-listening
  const [wakeActive, setWakeActive] = useState(false); // wake recognizer actually running
  const [wakeHeard, setWakeHeard] = useState(''); // live transcription from the wake scanner
  const [continuous, setContinuous] = useState(true); // auto re-listen after each reply

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeRecRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Mutable flags the recognizer callbacks read without stale closures.
  const modeRef = useRef<'idle' | 'wake' | 'active'>('idle');
  const speakingRef = useRef(false);
  const openRef = useRef(false);
  const continuousRef = useRef(true);
  const wakeEnabledRef = useRef(false);
  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);
  useEffect(() => {
    wakeEnabledRef.current = wakeEnabled;
  }, [wakeEnabled]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const orbStatus: OrbStatus = listening ? 'listening' : speaking ? 'speaking' : 'idle';

  useEffect(() => {
    if (!getSpeechRecognition()) setSupported(false);
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      try {
        wakeRecRef.current?.stop();
      } catch {
        /* ignore */
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, thinking, interim]);

  // Holds the latest "start an active listening turn" fn, so speak()'s onend can
  // resume listening without a forward-reference to startListening.
  const startActiveRef = useRef<() => void>(() => {});
  const startWakeRef = useRef<() => void>(() => {});

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || !('speechSynthesis' in window)) {
        // No TTS: in continuous mode, re-open the mic right away.
        if (continuousRef.current && openRef.current) {
          setTimeout(() => startActiveRef.current(), 300);
        }
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.pitch = 1;
      u.onstart = () => {
        speakingRef.current = true;
        setSpeaking(true);
      };
      const done = () => {
        speakingRef.current = false;
        setSpeaking(false);
        // Continuous conversation: after the AI finishes talking, listen again.
        if (continuousRef.current && openRef.current) {
          setTimeout(() => startActiveRef.current(), 350);
        }
      };
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    },
    [ttsEnabled, open]
  );

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  // Execute a write the user has approved.
  const runConfirmed = useCallback(async () => {
    setPendingConfirm((pc) => {
      if (!pc) return null;
      setThinking(true);
      executeWriteTool(pc.name, pc.args, profile?.organization_id ?? null)
        .then((result) => {
          const msg = result.message;
          setTurns((t) => [...t, { role: 'assistant', text: msg }]);
          speak(msg);
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : 'The action failed.';
          setError(msg);
          setTurns((t) => [...t, { role: 'assistant', text: `Error: ${msg}` }]);
        })
        .finally(() => setThinking(false));
      return null;
    });
  }, [profile?.organization_id, speak]);

  const cancelConfirm = useCallback(() => {
    setPendingConfirm(null);
    const msg = 'Okay, cancelled — nothing was changed.';
    setTurns((t) => [...t, { role: 'assistant', text: msg }]);
    speak(msg);
  }, [speak]);

  const ask = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q) return;

      // "Stop / that's all / goodbye" ends the continuous conversation.
      if (
        !pendingConfirm &&
        /^(stop|stop listening|that'?s all|that is all|goodbye|bye|thanks that'?s all|we'?re done|i'?m done|exit|end)\b/i.test(
          q
        )
      ) {
        setTurns((t) => [...t, { role: 'user', text: q }]);
        continuousRef.current = false;
        modeRef.current = wakeEnabledRef.current ? 'wake' : 'idle';
        const bye = 'Okay, I\u2019m here whenever you need me.';
        setTurns((t) => [...t, { role: 'assistant', text: bye }]);
        speak(bye);
        // restore continuous for the next session
        setTimeout(() => {
          continuousRef.current = continuous;
        }, 1500);
        return;
      }

      // If a write is awaiting confirmation, interpret this turn as yes/no.
      if (pendingConfirm) {
        const yes = /^(yes|yeah|yep|confirm|do it|go ahead|proceed|okay|ok|sure|please do)\b/i.test(q);
        const no = /^(no|nope|cancel|stop|don'?t|nevermind|never mind|abort)\b/i.test(q);
        setTurns((t) => [...t, { role: 'user', text: q }]);
        if (yes) {
          runConfirmed();
          return;
        }
        if (no) {
          cancelConfirm();
          return;
        }
        // Unclear → keep waiting, re-prompt.
        const reprompt = `Just to confirm: ${pendingConfirm.prompt} Please say yes or no.`;
        setTurns((t) => [...t, { role: 'assistant', text: reprompt }]);
        speak(reprompt);
        return;
      }

      setError(null);
      setInterim('');
      setTyped('');
      setThinking(true);
      const historyForApi = [...turns];
      setTurns((t) => [...t, { role: 'user', text: q }]);

      try {
        const context = await fetchLiveContext();
        const resp = await fetch('/api/voice-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: profile?.email,
            query: q,
            context,
            history: historyForApi,
          }),
        });
        let data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || 'Request failed.');

        // Two-step data loop: the agent asked for live data. Fetch it, then send
        // it back so the model phrases the final spoken answer.
        if (data.dataCall) {
          const dataResult = await executeDataTool(
            data.dataCall.name,
            data.dataCall.args || {}
          );
          const resp2 = await fetch('/api/voice-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: profile?.email,
              query: q,
              context,
              history: historyForApi,
              dataCall: data.dataCall,
              dataResult,
            }),
          });
          data = await resp2.json();
          if (!resp2.ok) throw new Error(data?.error || 'Request failed.');
        }

        const answer: string = data.answer;
        setTurns((t) => [...t, { role: 'assistant', text: answer }]);
        speak(answer);

        // A write was proposed → stash it and wait for explicit approval.
        if (data.confirm) {
          setPendingConfirm(data.confirm);
        }

        // Execute any platform action the agent decided on.
        const action: { type: string; args: Record<string, unknown> } | null = data.action;
        if (action?.type === 'navigate' && typeof action.args?.page === 'string') {
          onNavigate?.(action.args.page as string);
          // Close the overlay shortly after so the user sees the page they asked for.
          setTimeout(() => {
            recognitionRef.current?.stop();
            setListening(false);
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            setSpeaking(false);
            setOpen(false);
          }, 900);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Something went wrong.';
        setError(msg);
        setTurns((t) => [...t, { role: 'assistant', text: `Error: ${msg}` }]);
      } finally {
        setThinking(false);
      }
    },
    [turns, profile?.email, speak, onNavigate, pendingConfirm, runConfirmed, cancelConfirm, continuous]
  );

  // Start an ACTIVE listening turn (listening for a command/question).
  const startActive = useCallback(() => {
    const Rec = getSpeechRecognition();
    if (!Rec) {
      setSupported(false);
      return;
    }
    // Don't listen while the assistant is talking (it would hear itself).
    if (speakingRef.current) return;
    // Stop the wake scanner while we actively listen.
    try {
      wakeRecRef.current?.stop();
    } catch {
      /* ignore */
    }
    setError(null);
    setInterim('');
    modeRef.current = 'active';

    const rec = new Rec();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setInterim(text);
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setError('Microphone permission denied.');
      } else if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        setError(`Mic error: ${ev.error}`);
      }
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim((current) => {
        if (current.trim()) {
          ask(current);
        } else if (wakeEnabledRef.current && modeRef.current !== 'active') {
          // Nothing said → drop back to wake scanning.
          startWakeRef.current();
        }
        return '';
      });
    };

    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }, [ask]);

  // Keep the ref current so speak()'s onend can resume listening.
  useEffect(() => {
    startActiveRef.current = startActive;
  }, [startActive]);

  // Background WAKE-WORD scanner: listens quietly for "wake up".
  const startWake = useCallback(() => {
    const Rec = getSpeechRecognition();
    if (!Rec || !wakeEnabledRef.current) return;
    if (speakingRef.current || modeRef.current === 'active') return;
    modeRef.current = 'wake';

    const rec = new Rec();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setWakeHeard(text.trim().slice(-60)); // live transcription of what the browser hears
      // "wake up" — two real words, so browsers transcribe it reliably.
      // Also accept "wakeup"/"wake" as safe fallbacks.
      if (/\bwake ?up\b/i.test(text) || /\bwake\b/i.test(text)) {
        // Wake! Stop scanning and open an active turn.
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
        if (!open) {
          openRef.current = true;
          setOpen(true);
        }
        setWakeHeard('');
        const greet = 'Yes? How can I help?';
        setTurns((t) => [...t, { role: 'assistant', text: greet }]);
        speak(greet); // after greeting, continuous mode opens the mic
      }
    };
    rec.onstart = () => {
      setWakeActive(true);
    };
    rec.onerror = (ev: { error: string }) => {
      // Permission errors are fatal for wake mode — tell the user.
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setError('Microphone blocked. Allow mic access, then toggle the wake word again.');
        wakeEnabledRef.current = false;
        setWakeEnabled(false);
        setWakeActive(false);
      }
      // 'no-speech'/'aborted' are normal; onend will retry.
    };
    rec.onend = () => {
      setWakeActive(false);
      // Keep scanning as long as wake is enabled and we're not mid-command.
      if (wakeEnabledRef.current && modeRef.current !== 'active' && !speakingRef.current) {
        setTimeout(() => {
          try {
            startWakeRef.current();
          } catch {
            /* ignore */
          }
        }, 400);
      }
    };

    wakeRecRef.current = rec;
    try {
      rec.start();
    } catch {
      // A recognizer is already running — restart cleanly after a beat.
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        if (wakeEnabledRef.current) startWakeRef.current();
      }, 500);
    }
  }, [open, speak]);

  useEffect(() => {
    startWakeRef.current = startWake;
  }, [startWake]);

  // Turn the wake scanner on/off when the toggle changes.
  useEffect(() => {
    // Sync the ref synchronously here so startWake sees the correct value
    // regardless of effect ordering.
    wakeEnabledRef.current = wakeEnabled;
    if (wakeEnabled) {
      // small delay so any active recognizer has released the mic
      setTimeout(() => startWakeRef.current(), 200);
    } else {
      try {
        wakeRecRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (modeRef.current === 'wake') modeRef.current = 'idle';
    }
  }, [wakeEnabled]);

  const stopListening = useCallback(() => {
    continuousRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
    modeRef.current = wakeEnabledRef.current ? 'wake' : 'idle';
    // restore continuous preference for next turn
    setTimeout(() => {
      continuousRef.current = continuous;
      if (wakeEnabledRef.current) startWakeRef.current();
    }, 300);
  }, [continuous]);

  const close = useCallback(() => {
    continuousRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    try {
      wakeRecRef.current?.stop();
    } catch {
      /* ignore */
    }
    stopSpeaking();
    setListening(false);
    modeRef.current = 'idle';
    setOpen(false);
    setTimeout(() => {
      continuousRef.current = continuous;
    }, 300);
  }, [stopSpeaking, continuous]);

  if (!isAdmin) return null;

  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant')?.text || '';
  const statusLabel = listening
    ? 'LISTENING'
    : thinking
    ? 'PROCESSING'
    : speaking
    ? 'SPEAKING'
    : 'ONLINE';

  return (
    <>
      {/* keyframes for the waveform + subtle fades */}
      <style>{`
        @keyframes orbWave {
          0%, 100% { height: 5px; opacity: .5; }
          50% { height: 26px; opacity: 1; }
        }
        @keyframes orbFadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      {/* Launcher + site-wide wake control (visible on every page) */}
      {!open && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          {/* Live wake status + transcription, shown whenever wake is enabled */}
          {wakeEnabled && (
            <div className="flex max-w-[260px] items-center gap-2 rounded-full bg-slate-900/90 px-3 py-2 text-[11px] text-cyan-200 shadow-lg ring-1 ring-cyan-400/30 backdrop-blur">
              <span
                className={`h-2 w-2 shrink-0 rounded-full bg-cyan-400 ${
                  wakeActive ? 'animate-pulse' : 'opacity-40'
                }`}
              />
              <span className="truncate">
                {wakeHeard ? wakeHeard : wakeActive ? 'Say “wake up”…' : 'Starting…'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Toggle wake word from anywhere, without opening the panel */}
            <button
              onClick={() => setWakeEnabled((v) => !v)}
              className={
                wakeEnabled
                  ? `flex items-center gap-2 rounded-full px-4 py-3 text-white shadow-lg transition bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-600/30 ${
                      wakeActive ? 'animate-pulse' : ''
                    }`
                  : 'flex items-center gap-2 rounded-full bg-slate-800/90 px-4 py-3 text-cyan-200 shadow-lg ring-1 ring-cyan-400/30 backdrop-blur transition hover:bg-slate-700/90'
              }
              aria-label={wakeEnabled ? 'Turn off wake word' : 'Turn on wake word'}
              title={wakeEnabled ? 'Wake word ON — say “wake up”' : 'Enable “wake up” wake word'}
            >
              <Radio size={18} />
              <span className="text-sm font-semibold tracking-wide">
                {wakeEnabled ? 'Wake ON' : 'Wake'}
              </span>
            </button>

            {/* Open the full assistant panel */}
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-white shadow-lg shadow-cyan-600/30 transition hover:from-cyan-400 hover:to-blue-500"
              aria-label="Open DECKARC voice assistant"
            >
              <Bot size={20} />
              <span className="text-sm font-semibold tracking-wide">DECKARC AI</span>
            </button>
          </div>
        </div>
      )}

      {/* Full-screen Jarvis-style overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[60] overflow-hidden text-slate-100"
          style={{
            animation: 'orbFadeIn 300ms ease-out',
            background:
              'radial-gradient(120% 120% at 50% 40%, #0b2545 0%, #06182e 55%, #030b18 100%)',
          }}
        >
          {/* faint grid glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(56,189,248,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.6) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />

          {/* Top bar */}
          <div className="relative z-10 flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40">
                <Bot size={18} />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold tracking-[0.2em] text-cyan-200">
                  DECKARC&nbsp;AI
                </p>
                <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-400/60">
                  Neural Ops · Admin
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300 ring-1 ring-cyan-400/30 sm:flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                {statusLabel}
              </span>
              <button
                onClick={() => setWakeEnabled((v) => !v)}
                className={
                  wakeEnabled
                    ? `rounded-lg p-2 text-cyan-200 bg-cyan-500/20 ring-1 ring-cyan-400/50 ${
                        wakeActive ? 'animate-pulse' : ''
                      }`
                    : 'rounded-lg p-2 text-cyan-300/80 ring-1 ring-cyan-400/20 hover:bg-cyan-500/10'
                }
                title={
                  wakeEnabled
                    ? wakeActive
                      ? 'Listening for “wake up”…'
                      : 'Wake word ON (starting…)'
                    : 'Enable wake word “wake up”'
                }
              >
                <Radio size={16} />
              </button>
              <button
                onClick={() => setContinuous((v) => !v)}
                className={
                  continuous
                    ? 'rounded-lg p-2 text-cyan-200 bg-cyan-500/20 ring-1 ring-cyan-400/50'
                    : 'rounded-lg p-2 text-cyan-300/80 ring-1 ring-cyan-400/20 hover:bg-cyan-500/10'
                }
                title={continuous ? 'Continuous conversation ON' : 'Continuous conversation OFF'}
              >
                <Repeat size={16} />
              </button>
              <button
                onClick={() => setTtsEnabled((v) => !v)}
                className="rounded-lg p-2 text-cyan-300/80 ring-1 ring-cyan-400/20 hover:bg-cyan-500/10"
                title={ttsEnabled ? 'Mute voice replies' : 'Unmute voice replies'}
              >
                {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button
                onClick={close}
                className="rounded-lg p-2 text-cyan-300/80 ring-1 ring-cyan-400/20 hover:bg-red-500/20 hover:text-red-300"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Center stage: spokes + orb */}
          <div className="relative z-10 grid h-[calc(100%-64px)] grid-rows-[1fr_auto]">
            <div className="relative flex items-center justify-center px-4">
              {/* Left spokes */}
              <div className="pointer-events-none absolute left-4 top-1/2 hidden -translate-y-1/2 flex-col gap-3 md:flex lg:left-16">
                {LEFT_SPOKES.map((label) => (
                  <div key={label} className="flex items-center gap-2 text-right">
                    <span className="ml-auto text-xs tracking-wide text-cyan-200/70">
                      {label}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/70" />
                    <span className="h-px w-8 bg-gradient-to-r from-cyan-400/60 to-transparent" />
                  </div>
                ))}
              </div>

              {/* Right spokes */}
              <div className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-3 md:flex lg:right-16">
                {RIGHT_SPOKES.map((label) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="h-px w-8 bg-gradient-to-l from-cyan-400/60 to-transparent" />
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/70" />
                    <span className="text-xs tracking-wide text-cyan-200/70">{label}</span>
                  </div>
                ))}
              </div>

              {/* Orb + latest reply */}
              <div className="flex flex-col items-center">
                <VoiceOrb status={orbStatus} />

                {/* Latest spoken line under the orb */}
                <div className="mt-2 h-16 max-w-xl px-4 text-center">
                  {thinking ? (
                    <p className="flex items-center justify-center gap-2 text-sm text-cyan-300/80">
                      <Loader2 size={14} className="animate-spin" /> Processing…
                    </p>
                  ) : interim ? (
                    <p className="text-sm italic text-cyan-200/70">“{interim}”</p>
                  ) : lastAssistant ? (
                    <p className="text-sm text-cyan-100/90 line-clamp-3">{lastAssistant}</p>
                  ) : (
                    <p className="text-sm text-cyan-300/50">
                      Tap the mic and ask about the platform.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom console */}
            <div className="relative z-10 px-4 pb-6">
              {/* transcript (collapsible history) */}
              {turns.length > 0 && (
                <div
                  ref={scrollRef}
                  className="mx-auto mb-3 max-h-28 w-full max-w-2xl space-y-2 overflow-y-auto rounded-xl bg-slate-950/40 p-3 ring-1 ring-cyan-400/10"
                >
                  {turns.map((t, i) => (
                    <div
                      key={i}
                      className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                    >
                      <div
                        className={
                          t.role === 'user'
                            ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-cyan-500/20 px-3 py-1.5 text-sm text-cyan-100 ring-1 ring-cyan-400/30'
                            : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-800/70 px-3 py-1.5 text-sm text-slate-200'
                        }
                      >
                        {t.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {wakeEnabled && (
                <p className="mx-auto mb-2 max-w-2xl rounded-lg bg-cyan-500/10 px-3 py-2 text-center text-[11px] text-cyan-300/80 ring-1 ring-cyan-400/20">
                  {wakeActive ? '🎙️ Listening for “wake up”' : '⏳ Starting…'} · heard:{' '}
                  <span className="text-cyan-200">{wakeHeard || '—'}</span>
                </p>
              )}

              {error && (
                <p className="mx-auto mb-2 max-w-2xl rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-300 ring-1 ring-red-400/30">
                  {error}
                </p>
              )}

              {/* Confirmation card for a proposed write action */}
              {pendingConfirm && (
                <div className="mx-auto mb-3 flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-400/40">
                  <p className="text-sm text-amber-100">{pendingConfirm.prompt}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={runConfirmed}
                      className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={cancelConfirm}
                      className="rounded-lg bg-slate-700/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Waveform */}
              <div className="mb-3">
                <Waveform active={listening || speaking} />
              </div>

              {/* Command bar */}
              <div className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-full bg-slate-950/60 px-3 py-2 ring-1 ring-cyan-400/30 backdrop-blur">
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && typed.trim()) ask(typed);
                  }}
                  placeholder='Type a command, or say “wake up…”'
                  className="flex-1 bg-transparent px-2 text-sm text-cyan-100 placeholder:text-cyan-300/40 focus:outline-none"
                />

                {typed.trim() && (
                  <button
                    onClick={() => ask(typed)}
                    disabled={thinking}
                    className="rounded-full bg-cyan-500/20 p-2 text-cyan-200 ring-1 ring-cyan-400/40 hover:bg-cyan-500/30 disabled:opacity-50"
                    title="Send"
                  >
                    <Send size={16} />
                  </button>
                )}

                {supported ? (
                  <button
                    onClick={() => {
                      if (listening) {
                        stopListening();
                      } else {
                        stopSpeaking();
                        continuousRef.current = continuous;
                        startActive();
                      }
                    }}
                    disabled={thinking}
                    className={
                      listening
                        ? 'flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/40 transition hover:bg-red-600 disabled:opacity-50'
                        : 'flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/40 transition hover:from-cyan-300 hover:to-blue-500 disabled:opacity-50'
                    }
                    title={listening ? 'Stop listening' : 'Start listening'}
                  >
                    {listening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                ) : (
                  <span className="px-2 text-[11px] text-cyan-300/50">
                    Voice needs Chrome/Edge
                  </span>
                )}
              </div>

              <p className="mt-2 text-center text-[10px] uppercase tracking-[0.3em] text-cyan-400/40">
                {listening
                  ? 'Listening — speak now'
                  : thinking
                  ? 'Working…'
                  : speaking
                  ? 'Speaking…'
                  : 'Tap mic or type to begin'}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
