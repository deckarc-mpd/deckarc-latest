import { useEffect, useState, useRef } from 'react';
import { MessageSquare, Send, Loader, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Message {
  id: string;
  project_id: string;
  sender_role: string;
  sender_user_id: string | null;
  message_body: string;
  visibility: string;
  created_at: string;
  project?: { project_name: string };
}

interface Thread {
  project_id: string;
  project_name: string;
  messages: Message[];
  lastDate: string;
  unread: boolean;
}

function fmtDate(d: string) {
  const dt = new Date(d);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - dt.getTime()) / 86400000);
  if (diffDays === 0) return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return dt.toLocaleDateString('en-US', { weekday: 'short' });
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtFull(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getReadKey(userId: string, projectId: string) {
  return `cp360_msg_read_${userId}_${projectId}`;
}

function getLastReadTimestamp(userId: string, projectId: string): string | null {
  try { return localStorage.getItem(getReadKey(userId, projectId)); } catch { return null; }
}

function markThreadRead(userId: string, projectId: string, lastDate: string) {
  try { localStorage.setItem(getReadKey(userId, projectId), lastDate); } catch { /* ignore */ }
}

export default function ClientMessagesPage({ previewMode = false }: { previewMode?: boolean }) {
  const { profile } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    load();
  }, [profile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedProjectId, threads]);

  // Mark thread as read when selected
  useEffect(() => {
    if (!selectedProjectId || !profile) return;
    const thread = threads.find(t => t.project_id === selectedProjectId);
    if (thread) {
      markThreadRead(profile.id, selectedProjectId, thread.lastDate);
      setThreads(prev => prev.map(t =>
        t.project_id === selectedProjectId ? { ...t, unread: false } : t
      ));
    }
  }, [selectedProjectId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('communication_messages')
      .select('id, project_id, sender_role, sender_user_id, message_body, visibility, created_at, projects(project_name)')
      .neq('visibility', 'Admin Only')
      .neq('visibility', 'Internal Only')
      .order('created_at', { ascending: true });

    if (!error && data && profile) {
      const raw = data as any[];
      const byProject: Record<string, Thread> = {};
      raw.forEach(m => {
        const pid = m.project_id;
        const projName = m.projects?.project_name || 'Your Project';
        if (!byProject[pid]) {
          byProject[pid] = { project_id: pid, project_name: projName, messages: [], lastDate: m.created_at, unread: false };
        }
        byProject[pid].messages.push({ ...m, project: m.projects });
        byProject[pid].lastDate = m.created_at;
      });

      // Determine unread: last non-CLIENT message is newer than last read timestamp
      Object.values(byProject).forEach(thread => {
        const lastRead = getLastReadTimestamp(profile.id, thread.project_id);
        const lastNonClientMsg = [...thread.messages]
          .reverse()
          .find(m => m.sender_role !== 'CLIENT');
        if (lastNonClientMsg) {
          thread.unread = !lastRead || new Date(lastNonClientMsg.created_at) > new Date(lastRead);
        }
      });

      const sorted = Object.values(byProject).sort(
        (a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
      );
      setThreads(sorted);
      if (sorted.length > 0 && !selectedProjectId) {
        setSelectedProjectId(sorted[0].project_id);
      }
    }
    setLoading(false);
  }

  async function sendMessage() {
    if (!compose.trim() || !selectedProjectId || !profile) return;
    setSending(true);
    await supabase.from('communication_messages').insert({
      project_id: selectedProjectId,
      sender_user_id: profile.id,
      sender_role: 'CLIENT',
      message_body: compose.trim(),
      message_type: 'Client Message',
      visibility: 'Client Visible',
      status: 'Open',
    });
    setCompose('');
    setSending(false);
    load();
  }

  const activeThread = threads.find(t => t.project_id === selectedProjectId);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 h-14 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-steel-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">Messages</span>
          {!loading && threads.filter(t => t.unread).length > 0 && (
            <span className="ml-1 text-[10px] font-bold bg-steel-800 text-white px-1.5 py-0.5 rounded">
              {threads.filter(t => t.unread).length}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading messages...</span>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex h-[560px]">
              {/* Sidebar — project threads */}
              <div className="w-64 border-r border-slate-100 flex flex-col flex-shrink-0">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Projects</p>
                </div>
                {threads.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center px-4">
                    <p className="text-xs text-slate-400 text-center">No messages yet</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                    {threads.map(t => (
                      <button
                        key={t.project_id}
                        onClick={() => setSelectedProjectId(t.project_id)}
                        className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors ${selectedProjectId === t.project_id ? 'bg-slate-50' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-700 truncate flex-1 mr-1">Your Team</span>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{fmtDate(t.lastDate)}</span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{t.project_name}</p>
                        {t.unread && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Message pane */}
              <div className="flex-1 flex flex-col min-w-0">
                {activeThread ? (
                  <>
                    <div className="px-5 py-4 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-800">{activeThread.project_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Messages with your project team</p>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                      {activeThread.messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <MessageSquare className="w-8 h-8 text-slate-200 mb-2" />
                          <p className="text-xs text-slate-400">No messages yet. Send one below.</p>
                        </div>
                      ) : (
                        activeThread.messages.map(m => {
                          const isClient = m.sender_role === 'CLIENT';
                          return (
                            <div key={m.id} className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-xs rounded-2xl px-4 py-2.5 ${
                                isClient
                                  ? 'bg-steel-800 text-white rounded-tr-sm'
                                  : 'bg-slate-100 text-slate-700 rounded-tl-sm'
                              }`}>
                                <p className="text-sm leading-relaxed">{m.message_body}</p>
                                <p className={`text-[10px] mt-1 ${isClient ? 'text-slate-300 text-right' : 'text-slate-400'}`}>
                                  {isClient ? 'You' : 'Your Team'} · {fmtFull(m.created_at)}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={bottomRef} />
                    </div>

                    <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                      {previewMode ? (
                        <p className="text-xs text-center text-slate-400 italic py-2">
                          Messaging is disabled in Client Portal Preview.
                        </p>
                      ) : (
                        <div className="flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2">
                          <textarea
                            value={compose}
                            onChange={e => setCompose(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                            placeholder="Write a message..."
                            rows={2}
                            className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 resize-none outline-none leading-relaxed"
                          />
                          <button
                            onClick={sendMessage}
                            disabled={!compose.trim() || sending}
                            className="flex items-center gap-1.5 bg-steel-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-steel-700 transition-colors disabled:opacity-50 flex-shrink-0"
                          >
                            {sending ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            Send
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                      <MessageSquare className="w-6 h-6 text-slate-300" />
                    </div>
                    {threads.length === 0 ? (
                      <>
                        <p className="text-sm font-medium text-slate-500">No messages yet</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs">
                          Messages from your project team will appear here once your project communication begins.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-slate-500">Select a project</p>
                        <p className="text-xs text-slate-400 mt-1">Choose a project thread to view messages.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3 text-xs text-slate-400 justify-center">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <p>Only project-related messages approved for client visibility appear here.</p>
        </div>
      </div>
    </div>
  );
}
