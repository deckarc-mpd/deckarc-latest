# DECKARC Admin Voice/Text Assistant — Setup

This adds a floating AI assistant (speech-to-text in, spoken text-to-speech out,
plus a normal text chat) that is visible **only** to the account
`deckarc.admin@test.com`. It's enforced in two places:

1. **Frontend** (`src/components/AdminVoiceAssistant.tsx`) — the widget simply
   doesn't render unless `profile.email === 'deckarc.admin@test.com'`.
2. **Backend** (`api/assistant.js`, a Vercel serverless function) — every
   request is re-checked server-side using the caller's Supabase access
   token, so someone can't just call the API directly and bypass the UI
   check. This is also where the Gemini API key lives, so it never reaches
   the browser.

## How it works

- **Speech-to-text**: uses the browser's built-in `SpeechRecognition` API
  (Chrome/Edge). No API key or cost — it's free and runs in the browser.
- **Text-to-speech**: uses the browser's built-in `speechSynthesis` API.
  Also free, no API key.
- **The "brain"**: Google's **Gemini API** (`gemini-3.5-flash-lite`), which has a
  free tier. The serverless function sends the question (plus a system
  prompt describing the CP360 platform) and returns the answer.
- **Hosting for the API route**: since this repo is a plain Vite SPA (not
  Next.js), the AI endpoint is implemented as a **Vercel Serverless
  Function** at `/api/assistant.js`. Supabase Edge Functions are *not* used
  for this feature, per your request — Supabase is still used only for auth
  and the app's existing database access.

## Deploy / configure on Vercel

1. Push this project to a Git repo and import it into Vercel (or run
   `vercel` from the project root). `vercel.json` is already set up to build
   with Vite and serve `/api/*` as serverless functions.
2. In the Vercel project → **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | Your key from https://aistudio.google.com/apikey (free tier) |
   | `SUPABASE_URL` | Same value as `VITE_SUPABASE_URL` in `.env` |
   | `SUPABASE_ANON_KEY` | Same value as `VITE_SUPABASE_ANON_KEY` in `.env` |
   | `ADMIN_ASSISTANT_EMAIL` | *(optional)* defaults to `deckarc.admin@test.com` if omitted |

   Also add your existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   as env vars too (build-time), since the frontend already needs them.

3. Redeploy. The assistant bubble (bottom-right, sparkle icon) will only
   appear when logged in as `deckarc.admin@test.com`.

## Local testing

`vercel dev` (Vercel CLI) will run both the Vite dev server and the
`/api/assistant` function together with the same env vars. Plain `npm run
dev` will run the frontend but the `/api/assistant` calls will 404 since
there's no Vercel functions runtime — use `vercel dev` when you want to test
the assistant locally.

## Notes / things to double check

- Gemini's free tier has rate limits (requests/minute and per day) — fine for
  a single admin's usage, but worth knowing if it ever errors with a 429.
- Browser speech recognition (STT) works in Chrome and Edge; Safari/Firefox
  support is limited or absent, so the mic button auto-disables with a
  tooltip if unsupported, but typing still works everywhere.
- The assistant currently answers **general platform questions** (how
  features work, where to find things) based on a system prompt — it does
  not yet query live project/task data the way the existing "Ask CP360"
  panel does. If you want it to also answer questions about specific live
  data (e.g. "how many tasks are overdue right now"), that data would need
  to be fetched from Supabase and included in the request to Gemini — happy
  to add that next if useful.
