// Backs GeminiSynthesisClient (src/lib/aiBrain/domains/chiefOfStaff/synthesis.ts).
// Same pattern as interpret-field-update.ts. Receives an ALREADY-RANKED
// list (the deterministic ranking already happened — this endpoint only
// adds framing text, never reorders). NOT exercised against a live model
// from this sandbox.

export const config = { runtime: 'edge' };

const MODEL = 'gemini-3.5-flash-lite';

interface RankedItem {
  rank: number;
  source: string;
  title: string;
  detail: string;
  projectId: string;
}

const SYSTEM_PROMPT = `You are an executive assistant writing a one-paragraph morning brief for a construction company owner. You are given an ALREADY-PRIORITIZED list of items needing attention today (rank 1 = most important) — do not re-order or second-guess the ranking. Write ONE short, plain paragraph (2-4 sentences) giving the owner context on why today's top items matter, in a calm, direct, "Apple-simple" tone — no jargon, no alarmism, no bullet points.

Respond with ONLY a JSON object: {"framing": "..."}. No markdown, no extra text.`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'Server is missing GEMINI_API_KEY.' }, 500);

  let body: { items: RankedItem[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const userText = body.items
    .map((i) => `${i.rank}. [${i.source}] ${i.title} (project ${i.projectId})${i.detail ? ' — ' + i.detail : ''}`)
    .join('\n');

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 250, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!resp.ok) return json({ error: 'Gemini request failed.' }, 502);

    const data = await resp.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
    return json({ framing: parsed.framing });
  } catch (e) {
    return json({ error: 'Upstream error contacting Gemini.', detail: String(e).slice(0, 300) }, 502);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
