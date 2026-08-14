// Vercel Serverless Function: /api/assistant
// Verifies the caller is the DECKARC admin (server-side, using their Supabase
// access token) and then proxies the question to Google's Gemini API
// (free tier). The Gemini API key never reaches the browser.
//
// Required environment variables (set these in the Vercel project settings,
// NOT in .env / VITE_* — they must stay server-only):
//   GEMINI_API_KEY        - from https://aistudio.google.com/apikey
//   SUPABASE_URL           - same value as VITE_SUPABASE_URL
//   SUPABASE_ANON_KEY       - same value as VITE_SUPABASE_ANON_KEY
//   ADMIN_ASSISTANT_EMAIL  - optional, defaults to deckarc.admin@test.com

const ALLOWED_EMAIL = (process.env.ADMIN_ASSISTANT_EMAIL || 'deckarc.admin@test.com').toLowerCase();

const SYSTEM_INSTRUCTION = `You are the in-app voice/chat assistant for CP360, DECKARC's construction
project-management platform. You help the DECKARC admin quickly understand and use the
platform by voice or text. Answer questions about how the platform works: projects, tasks,
daily updates, permits & inspections, alerts, the action board, file vault, client portal,
reports, user & role management (CONVAZANT_SUPER_ADMIN, DECKARC_ADMIN, GENERAL_CONTRACTOR,
SUBCONTRACTOR, CLIENT), and general navigation. Keep answers short, spoken-friendly, and
practical — this may be read aloud by text-to-speech, so avoid long lists, markdown, or
special characters. If you don't know something about the user's specific data (their
actual projects, tasks, numbers), say so plainly instead of guessing, and suggest where
in the app they can find it.`;

async function verifyAdmin(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Server missing SUPABASE_URL / SUPABASE_ANON_KEY env vars');
  }
  if (!accessToken) return false;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });
  if (!res.ok) return false;
  const user = await res.json();
  const email = (user?.email || '').toLowerCase();
  return email === ALLOWED_EMAIL;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const isAdmin = await verifyAdmin(accessToken);
    if (!isAdmin) {
      return res.status(403).json({ error: 'This assistant is only available to the DECKARC admin.' });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(500).json({ error: 'Server missing GEMINI_API_KEY env var' });
    }

    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing "message" string in request body' });
    }

    // history: array of { role: 'user' | 'model', text: string }, most recent last.
    const contents = [];
    if (Array.isArray(history)) {
      for (const turn of history.slice(-10)) {
        if (!turn || !turn.text) continue;
        contents.push({
          role: turn.role === 'model' ? 'model' : 'user',
          parts: [{ text: String(turn.text).slice(0, 4000) }],
        });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message.slice(0, 4000) }] });

    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 400,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error', geminiRes.status, errText);
      return res.status(502).json({ error: 'The AI service could not be reached right now.' });
    }

    const data = await geminiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ').trim() ||
      "I couldn't come up with an answer to that — could you rephrase it?";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('assistant handler error', err);
    return res.status(500).json({ error: 'Something went wrong handling your request.' });
  }
}
