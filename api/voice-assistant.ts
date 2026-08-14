// Vercel serverless function — DECKARC AI agent brain.
// Uses Google Gemini (free tier) with function-calling so the model REASONS about
// intent and can trigger platform actions (navigation, etc.) rather than keyword-matching.
//
// The GEMINI_API_KEY lives ONLY in Vercel env vars, never in the browser.
// Get a free key at https://aistudio.google.com/apikey and set it in
// Vercel → Project Settings → Environment Variables.

export const config = { runtime: 'edge' };

const MODEL = 'gemini-3.5-flash-lite';
const ADMIN_EMAIL = 'deckarc.admin@test.com';

// ── Company knowledge base ───────────────────────────────────────────────
// Served here (not hardcoded if/else in the UI). Edit this to teach the AI.
const COMPANY_KNOWLEDGE = `
DECKARC — company knowledge base.

ABOUT DECKARC:
DECKARC is a high-end custom home builder and remodeling company serving the greater
Charlotte, NC metro area (Ballantyne, Lake Norman, Huntersville, Matthews, Waxhaw, Mooresville).
It delivers custom builds and remodels with a focus on turning day-to-day project chaos into
a clear, proactive plan.

CP360 (the platform this assistant lives in):
CP360 (ConstructionProgress360) is DECKARC's AI-powered construction operations platform.
It helps owner-led residential contractors manage projects, tasks, schedules, daily field
updates, permits & inspections, alerts, reports, clients, and payments in one place.

PROJECT PULSE:
Project Pulse is CP360's at-a-glance health view of every active project. It surfaces which
projects are on track, at risk, or delayed, along with progress percentage and what needs
attention today. It is designed so an owner can understand the state of the whole business in
seconds instead of digging through spreadsheets.

MAJOR MODULES:
- Dashboard: the home overview / command center.
- Action Board: what needs attention right now.
- Tomorrow's Work: planned work for the next day.
- Projects: all projects and their details.
- Tasks: tasks and milestones.
- Daily Updates: field updates from crews.
- Permits & Inspections: compliance tracking.
- Alerts: risk and consent notifications.
- Reports: generated reports and exports.
- Users: platform users and roles.
- Settings: configuration.
- Field Mode: simplified on-site interface.
- Files / File Vault: documents.
- Company: company info.

TONE / POLICY:
- Speak like a knowledgeable, professional DECKARC employee: friendly, concise, accurate.
- Never invent data. If you don't have a figure, say where in the platform to find it, or ask.
- When the user's request maps to opening a screen, CALL the navigate function instead of
  describing how to click there.
`.trim();

const SYSTEM_PROMPT = `You are DECKARC AI, the primary voice-and-text agent for the DECKARC / CP360 construction operations platform. You behave like an experienced DECKARC employee — professional, friendly, concise, accurate, and honest when uncertain.

You are NOT a keyword bot or an FAQ script. You REASON about the user's intent from natural language, and you either (a) answer using the company knowledge and any live context provided, or (b) take an action by calling a function.

RULES:
- Keep spoken answers SHORT and natural — this is read aloud by text-to-speech. Avoid markdown, bullets, and code. Aim for 1-3 sentences unless asked for detail.
- When the user wants to go to / open / show a screen or module, CALL the navigate function. Do not just explain how to click there. After navigating, confirm briefly (e.g. "Opening the dashboard.").
- Use conversation history to resolve references like "it", "that project", "there".
- If you lack the data to answer precisely, say so honestly and point to where it lives, or ask one clarifying question. Never fabricate numbers, names, or statuses.
- Use the company knowledge base below as your source of truth about DECKARC and CP360.

${COMPANY_KNOWLEDGE}`;

// Valid navigation targets (must match the app's Page union).
const PAGES = [
  'dashboard', 'action-board', 'tomorrow', 'projects', 'tasks', 'daily-updates',
  'permits', 'alerts', 'reports', 'users', 'settings', 'field-mode', 'templates',
  'files', 'integrations', 'company', 'cp360-leads', 'sub-projects', 'customer-discovery',
];

// Function/tool declarations Gemini can call.
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'navigate',
        description:
          "Open or navigate to a screen/module in the DECKARC platform. Use whenever the user asks to open, show, go to, or view a page.",
        parameters: {
          type: 'object',
          properties: {
            page: {
              type: 'string',
              enum: PAGES,
              description: 'The target page to open.',
            },
          },
          required: ['page'],
        },
      },
      {
        name: 'query_projects',
        description:
          "Retrieve live projects. Use for questions about projects: how many, which are delayed/at-risk/on-track, progress, or a specific project by name. Returns rows the assistant can summarize.",
        parameters: {
          type: 'object',
          properties: {
            health: {
              type: 'string',
              enum: ['all', 'at_risk', 'delayed', 'on_track'],
              description:
                "Filter by health. 'at_risk' = yellow alert, 'delayed' = red alert, 'on_track' = green. Default 'all'.",
            },
            name_contains: {
              type: 'string',
              description: 'Filter to projects whose name contains this text (e.g. a client or project name).',
            },
          },
        },
      },
      {
        name: 'query_tasks',
        description:
          "Retrieve live tasks. Use for questions about tasks: how many are delayed/blocked/in progress, what's due, or overdue work.",
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['all', 'In Progress', 'Delayed', 'Blocked', 'Not Started', 'Completed', 'Pending', 'Open'],
              description: 'Filter tasks by status. Default all.',
            },
          },
        },
      },
      {
        name: 'query_action_items',
        description:
          "Retrieve open action items / what needs attention. Use for 'what needs attention', 'what's urgent', 'anything on fire today'.",
        parameters: {
          type: 'object',
          properties: {
            priority: {
              type: 'string',
              enum: ['all', 'High', 'Medium', 'Low'],
              description: 'Filter open action items by priority. Default all.',
            },
          },
        },
      },
      {
        name: 'query_permits',
        description:
          "Retrieve permits and inspections status. Use for questions about permits, inspections, approvals, or compliance.",
        parameters: {
          type: 'object',
          properties: {
            pending_only: {
              type: 'boolean',
              description: 'If true, return only permits not yet approved. Default false.',
            },
          },
        },
      },
      {
        name: 'create_project',
        description:
          "Create a new project. Requires at minimum a project name and a client name. This CHANGES data, so it will be confirmed with the user before running.",
        parameters: {
          type: 'object',
          properties: {
            project_name: { type: 'string', description: 'Name of the new project.' },
            client_name: { type: 'string', description: 'Client / customer name for the project.' },
            project_type: { type: 'string', description: 'Optional type, e.g. Remodel, Custom Build.' },
            description: { type: 'string', description: 'Optional short description.' },
          },
          required: ['project_name', 'client_name'],
        },
      },
      {
        name: 'update_task_status',
        description:
          "Change the status of an existing task, found by its name. This CHANGES data, so it will be confirmed with the user before running.",
        parameters: {
          type: 'object',
          properties: {
            task_name: { type: 'string', description: 'Name (or part of the name) of the task to update.' },
            new_status: {
              type: 'string',
              enum: ['Not Started', 'In Progress', 'Completed', 'Delayed', 'Blocked', 'Pending', 'Open'],
              description: 'The new status to set.',
            },
          },
          required: ['task_name', 'new_status'],
        },
      },
    ],
  },
];

// Which tools are DATA reads the frontend must execute against Supabase.
const DATA_TOOLS = new Set(['query_projects', 'query_tasks', 'query_action_items', 'query_permits']);

// Which tools WRITE data — these require explicit user confirmation before executing.
const WRITE_TOOLS = new Set(['create_project', 'update_task_status']);

// Human-readable confirmation prompt for a proposed write.
function describeWrite(name: string, args: Record<string, unknown>): string {
  if (name === 'create_project') {
    return `Create a new project “${args.project_name}” for client “${args.client_name}”?`;
  }
  if (name === 'update_task_status') {
    return `Set task “${args.task_name}” to “${args.new_status}”?`;
  }
  return 'Proceed with this change?';
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'Server is missing GEMINI_API_KEY.' }, 500);

  let body: {
    email?: string;
    query?: string;
    context?: string;
    history?: Array<{ role: string; text: string }>;
    // Step 2 of the data loop: the frontend fetched data for a prior tool call
    // and sends it back so the model can phrase the spoken answer.
    dataCall?: { name: string; args: Record<string, unknown> };
    dataResult?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!body.email || body.email.toLowerCase() !== ADMIN_EMAIL) {
    return json({ error: 'Not authorized.' }, 403);
  }

  const query = (body.query || '').trim();
  if (!query) return json({ error: 'Empty query.' }, 400);

  // Build contents from history (memory) + current query (+ live context).
  const contents: Array<{ role: string; parts: unknown[] }> = [];
  for (const turn of body.history?.slice(-10) || []) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.text }],
    });
  }
  const userText = body.context
    ? `Live platform context: ${body.context}\n\nUser: ${query}`
    : query;
  contents.push({ role: 'user', parts: [{ text: userText }] });

  // If this is step 2 (data came back), replay the model's function call and the
  // function result so Gemini can now produce the final natural-language answer.
  if (body.dataCall && body.dataResult !== undefined) {
    contents.push({
      role: 'model',
      parts: [{ functionCall: { name: body.dataCall.name, args: body.dataCall.args || {} } }],
    });
    contents.push({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: body.dataCall.name,
            response: { result: body.dataResult },
          },
        },
      ],
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: TOOLS,
        generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return json({ error: 'Gemini request failed.', detail: detail.slice(0, 500) }, 502);
    }

    const data = await resp.json();
    const parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> =
      data?.candidates?.[0]?.content?.parts || [];

    // Collect any spoken text + any function call the model chose.
    let answer = parts.map((p) => p.text || '').join('').trim();
    const fc = parts.find((p) => p.functionCall)?.functionCall;

    // A DATA tool call → tell the frontend to fetch, then call us back (step 2).
    if (fc && DATA_TOOLS.has(fc.name)) {
      return json({
        answer: answer || null,
        dataCall: { name: fc.name, args: fc.args || {} },
      });
    }

    // A WRITE tool call → do NOT execute. Return a confirmation request; the
    // frontend will ask the user and only run the write on explicit approval.
    if (fc && WRITE_TOOLS.has(fc.name)) {
      const prompt = describeWrite(fc.name, fc.args || {});
      return json({
        answer: answer || prompt,
        confirm: { name: fc.name, args: fc.args || {}, prompt },
      });
    }

    // A navigate (or other direct) action.
    let action: { type: string; args: Record<string, unknown> } | null = null;
    if (fc) {
      action = { type: fc.name, args: fc.args || {} };
      if (!answer) {
        if (fc.name === 'navigate') {
          const page = String(fc.args?.page || '').replace(/-/g, ' ');
          answer = `Opening ${page}.`;
        } else {
          answer = 'On it.';
        }
      }
    }

    if (!answer) answer = "I didn't catch that — could you rephrase?";

    return json({ answer, action });
  } catch (e) {
    return json({ error: 'Upstream error contacting Gemini.', detail: String(e).slice(0, 300) }, 502);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
