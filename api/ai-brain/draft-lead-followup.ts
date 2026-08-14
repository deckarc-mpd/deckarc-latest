// Backs GeminiFollowUpDraftClient (src/lib/aiBrain/domains/sales/followUpDraftClient.ts).
// Same Gemini REST pattern as interpret-field-update.ts. Server-side only —
// the API key never reaches the browser. NOT exercised against a live
// model from this sandbox; the caller already degrades to the deterministic
// template on any non-200/malformed response. The model only ever sees a
// StaleLeadFinding (name, company, status, days stale) — never raw pipeline
// data — so it cannot fabricate a claim about the lead's history, matching
// this SOP's groundedness verification, which independently checks the
// produced draft actually names the lead.

export const config = { runtime: 'edge' };

const MODEL = 'gemini-3.5-flash-lite';

interface RequestBody {
  fullName: string;
  companyName: string;
  status: string;
  daysSinceCreated: number;
}

const SYSTEM_PROMPT = `You draft a short, warm follow-up email to a construction-industry sales lead who has gone quiet. You are given only the lead's name, company, current pipeline status, and how many days since they first reached out — never any other pipeline data, so do not invent details about their project or prior conversations. Keep it brief, friendly, and low-pressure — one short paragraph.

Respond with ONLY a JSON object: {"subject": "...", "body": "..."}. The body MUST include the lead's full name verbatim. No markdown, no extra text.`;

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

  const userText = `Lead name: ${body.fullName}\nCompany: ${body.companyName || 'none given'}\nPipeline status: ${body.status}\nDays since first contact: ${body.daysSinceCreated}`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 300, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!resp.ok) return json({ error: 'Gemini request failed.' }, 502);

    const data = await resp.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
    return json({ subject: parsed.subject, body: parsed.body });
  } catch (e) {
    return json({ error: 'Upstream error contacting Gemini.', detail: String(e).slice(0, 300) }, 502);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
