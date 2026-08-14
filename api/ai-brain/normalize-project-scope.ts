// Backs GeminiScopeInterpreter (src/lib/aiBrain/domains/estimating/scopeInterpreter.ts).
// Same Gemini REST pattern as interpret-field-update.ts. Server-side only —
// the API key never reaches the browser. NOT exercised against a live
// model from this sandbox; the caller already degrades to the deterministic
// keyword classifier on any non-200/malformed/unknown-category response.
// Per Frozen §7, this endpoint only ever classifies free text into a known
// category — it never touches pricing; ScopeNormalizationResult carries no
// numeric field for it to influence even by accident.

export const config = { runtime: 'edge' };

const MODEL = 'gemini-3.5-flash-lite';

interface RequestBody {
  scopeText: string;
  knownCategories: string[];
}

const SYSTEM_PROMPT = `You classify a free-text construction project scope description into exactly one of a fixed set of known categories, for an estimator building a pricing comparison. You will be given the scope text and the full list of allowed categories — you MUST choose one verbatim from that list, never invent a new one.

Respond with ONLY a JSON object: {"normalizedCategory": "<one of the given categories, verbatim>", "confidence": one of "high"|"medium"|"low", "explanation": "..."}. No markdown, no extra text.`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'Server is missing GEMINI_API_KEY.' }, 500);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const userText = `Scope text: "${body.scopeText}"\nAllowed categories: ${(body.knownCategories || []).join(', ')}`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 200, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!resp.ok) return json({ error: 'Gemini request failed.' }, 502);

    const data = await resp.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
    return json({ normalizedCategory: parsed.normalizedCategory, confidence: parsed.confidence, explanation: parsed.explanation });
  } catch (e) {
    return json({ error: 'Upstream error contacting Gemini.', detail: String(e).slice(0, 300) }, 502);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
