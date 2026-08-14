// Backs GeminiFinanceInterpreter (src/lib/aiBrain/domains/finance/aiInterpreter.ts).
// Same Gemini REST pattern as interpret-field-update.ts. Server-side only —
// the API key never reaches the browser. NOT exercised against a live
// model from this sandbox; the caller already degrades gracefully on any
// non-200/malformed response, so a misconfigured key fails safe rather
// than blocking the deterministic finance verdict. Per Frozen §5, this
// endpoint only ever produces an explanation — it never computes billing
// math, due dates, margin, or cash figures.

export const config = { runtime: 'edge' };

const MODEL = 'gemini-3.5-flash-lite';

interface RequestBody {
  gateFindings: string[];
  overallStatus: string;
  freeText: string[];
}

const SYSTEM_PROMPT = `You interpret construction-project financial records (billing, collections, AP, margin, cash forecast) for a Billing/AR/Margin Sweep. You are given the deterministic gate findings (already decided — you cannot change them) and free-text vendor dispute notes. Classify the situation and write ONE short, plain-English paragraph explaining WHY this needs a human look, for a project owner to read in seconds. Never state or imply a specific dollar figure that isn't already in the gate findings.

Respond with ONLY a JSON object: {"category": one of "billing_dispute"|"collections_response"|"ap_dispute"|"other", "severity": one of "low"|"medium"|"high", "explanation": "..."}. No markdown, no extra text.`;

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

  const userText = `Deterministic overall status: ${body.overallStatus}\nFailed gate findings: ${body.gateFindings.join('; ') || 'none'}\nVendor/client dispute notes: ${body.freeText.join('; ') || 'none'}`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 300, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!resp.ok) return json({ error: 'Gemini request failed.' }, 502);

    const data = await resp.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
    return json({ category: parsed.category, severity: parsed.severity, explanation: parsed.explanation });
  } catch (e) {
    return json({ error: 'Upstream error contacting Gemini.', detail: String(e).slice(0, 300) }, 502);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
