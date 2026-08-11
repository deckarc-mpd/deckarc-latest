import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Sparkles, X, Send, Mic, MicOff, Volume2, VolumeX, Loader2,
} from 'lucide-react';

// Only this account gets the AI voice/text assistant. Restricted here (frontend
// gate for UX) AND again server-side in /api/assistant.js (real enforcement,
// since anyone could otherwise call the API directly).
const ALLOWED_EMAIL = 'deckarc.admin@test.com';

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

// Minimal ambient types so this compiles without lib.dom speech-recognition types.
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function AdminVoiceAssistant() {
  const { profile, session } = useAuth();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSpeechSupported(!!getSpeechRecognition() && 'speechSynthesis' in window);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Only render anything at all for the DECKARC admin account.
  if (!profile || profile.email?.toLowerCase() !== ALLOWED_EMAIL) {
    return null;
  }

  function speak(text: string) {
    if (!speakEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setInput('');
    const nextHistory: ChatTurn[] = [...messages, { role: 'user', text: trimmed }];
    setMessages(nextHistory);
    setLoading(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message: trimmed, history: nextHistory }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Something went wrong.');
      }
      setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);
      speak(data.reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function toggleListening() {
    const RecognitionCtor = getSpeechRecognition();
    if (!RecognitionCtor) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    window.speechSynthesis?.cancel();
    const recognition = new RecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        sendMessage(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError('Could not hear that clearly — please try again.');
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <>
      {/* Floating launcher
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-steel-800 hover:bg-steel-700 shadow-lg flex items-center justify-center transition-colors"
          title="DECKARC Admin Assistant"
        >
          <Sparkles className="w-6 h-6 text-amber-400" />
        </button>
      )} */}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl border border-concrete-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-steel-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-steel-700 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-tight">DECKARC Assistant</p>
                <p className="text-[10px] text-steel-300 leading-tight">Admin only · voice &amp; text</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSpeakEnabled((v) => { if (v) window.speechSynthesis?.cancel(); return !v; })}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-steel-300 hover:text-white hover:bg-steel-700 transition-colors"
                title={speakEnabled ? 'Mute spoken replies' : 'Enable spoken replies'}
              >
                {speakEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-steel-300 hover:text-white hover:bg-steel-700 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-concrete-50">
            {messages.length === 0 && (
              <div className="text-center text-xs text-concrete-400 mt-6 px-4">
                Ask me anything about the CP360 platform — projects, tasks, permits, alerts,
                roles, or how to find something. Tap the mic to speak.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-steel-800 text-white rounded-br-sm'
                      : 'bg-white border border-concrete-200 text-concrete-800 rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-concrete-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-steel-500 animate-spin" />
                  <span className="text-xs text-concrete-500">Thinking...</span>
                </div>
              </div>
            )}
            {error && (
              <div className="text-center text-xs text-red-500 px-2">{error}</div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-concrete-200 px-3 py-3 flex-shrink-0 bg-white">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleListening}
                disabled={!speechSupported}
                className={`w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${
                  listening
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-concrete-100 text-concrete-600 hover:bg-steel-100 hover:text-steel-700'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={speechSupported ? (listening ? 'Stop listening' : 'Speak your question') : 'Voice input not supported in this browser'}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
                placeholder={listening ? 'Listening...' : 'Type or speak a question...'}
                disabled={listening}
                className="input-field flex-1 text-sm py-2"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="w-9 h-9 flex-shrink-0 rounded-full bg-steel-800 hover:bg-steel-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
                title="Send"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
