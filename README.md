# Alim AI

A multi-model AI chat platform: React frontend, Node/Express backend, JWT auth, and a
**model router** that lets you plug in multiple AI providers and switch between them
per message. Deployable to **Vercel** as a single project (static frontend + serverless API).

## Providers

- **Groq** (default) — OpenAI-compatible, generous free tier. Powers the GPT-OSS models.
- **Anthropic** — Claude models.
- **OpenAI** — GPT models.

Only models whose API key is configured appear in the model picker, so the dropdown
never shows a dead option. Add a provider by adding one entry to
`backend/src/services/modelRegistry.js` and one adapter file in
`backend/src/services/providers/`.

## Project layout

```
alim-ai/
├── api/
│   └── index.js               # Vercel serverless entrypoint (exports the Express app)
├── vercel.json                # Routes /api/* -> function, everything else -> SPA
├── package.json               # Dependencies for the serverless API function
├── backend/
│   └── src/
│       ├── server.js          # Express app (exported for serverless; listens only in local dev)
│       ├── db.js              # libSQL / Turso storage (SQLite-compatible)
│       ├── middleware/auth.js # JWT verification
│       ├── routes/            # auth, models, chat
│       └── services/          # modelRegistry, modelRouter, providers/{groq,anthropic,openai}
└── frontend/                  # Vite + React app (built to frontend/dist)
```

## Environment variables

| Variable             | Where            | Required?                    | Notes                                             |
| -------------------- | ---------------- | ---------------------------- | ------------------------------------------------- |
| `JWT_SECRET`         | local + Vercel   | **Yes**                      | Any long random string (`openssl rand -hex 32`).  |
| `GROQ_API_KEY`       | local + Vercel   | At least one provider key    | Free at console.groq.com. Enables GPT-OSS models. |
| `ANTHROPIC_API_KEY`  | local + Vercel   | optional                     | Enables Claude models.                            |
| `OPENAI_API_KEY`     | local + Vercel   | optional                     | Enables GPT models.                               |
| `TURSO_DATABASE_URL` | Vercel           | **Yes on Vercel**            | `libsql://...` from Turso. Local dev omits it.    |
| `TURSO_AUTH_TOKEN`   | Vercel           | **Yes on Vercel**            | Turso auth token.                                 |

> On Vercel, leaving `TURSO_DATABASE_URL` unset fails fast with a clear message —
> a file-based database can't work on a serverless filesystem.

## Run locally

```bash
# Backend (terminal 1)
cd backend
npm install
cp .env.example .env      # fill in JWT_SECRET and at least one provider key
npm run dev               # http://localhost:4000 — creates a local alim.sqlite file

# Frontend (terminal 2)
cd frontend
npm install
npm run dev               # http://localhost:5173, proxies /api -> :4000
```

Register → pick a model → send a message. History is saved to the DB and routed to
the right provider.

## Deploy to Vercel

1. **Create a database (free):** install the [Turso CLI](https://docs.turso.tech/cli/installation), then:
   ```bash
   turso db create alim-ai
   turso db show alim-ai --url        # -> TURSO_DATABASE_URL
   turso db tokens create alim-ai     # -> TURSO_AUTH_TOKEN
   ```
2. **Import the repo into Vercel.** Leave the **Root Directory** as the repo root
   (the included `vercel.json` handles building both the frontend and the API).
   Don't override the build/output settings.
3. **Add Environment Variables** in the Vercel project settings:
   `JWT_SECRET`, `GROQ_API_KEY` (and/or the other provider keys),
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
4. **Deploy.** The frontend is served statically; every `/api/*` request is handled by
   the serverless function. The tables are created automatically on first request.

## What changed vs. the original starter

This version was reworked to actually run on Vercel's serverless platform:

- **Serverless entrypoint added.** The Express app is now exported (`export default app`)
  and invoked per-request by `api/index.js`; it only calls `app.listen()` in local dev.
  (Previously it only called `app.listen()` and exported nothing — a serverless function
  with nothing to invoke, which is what produced `FUNCTION_INVOCATION_FAILED`.)
- **Storage moved off the local disk.** `node:sqlite` wrote a file to the app directory,
  which is read-only on Vercel and wiped between cold starts. It's now **libSQL/Turso**
  (still SQLite — the schema and queries are unchanged; DB calls are just `await`ed).
- **Groq provider added** and wired into the router + registry.
- **Hardened for production:** clear errors for missing `JWT_SECRET`/DB config, and route
  handlers no longer crash the function on a bad request or upstream error.

## Brains (RAG — chat with your own data)

A **Brain** is a named knowledge base built from documents you paste or upload.
On each message Alim finds the most relevant chunks from the chosen Brain and
feeds them to the model, so answers are grounded in *your* data rather than the
model's training. This is NOT fine-tuning — updates are instant and free, and it
works even on Groq (which can't fine-tune).

**Use it:** open the app → sidebar **Brains → ＋** → create a Brain → paste text
or upload a `.txt`/`.md` file. Then above the message box pick:

- **✨ Smart** — auto-routes your question across all your Brains.
- **🧠 A specific Brain** — pins answers to that one knowledge base.
- **○ No Brain** — plain chat, no retrieval.

### How it works
1. `POST /api/brains/:id/documents` chunks the text (~1100 chars, overlapping),
   embeds each chunk (OpenAI `text-embedding-3-small`), and stores them in the
   `chunks` table (embedding as JSON).
2. On send, `routes/chat.js` retrieves the top matches (cosine similarity in
   Node; keyword fallback if no embeddings key) and prepends them as a system
   prompt before calling the model.

### Embeddings key
Semantic search needs `OPENAI_API_KEY` (used only for embeddings — cheap, ~$0.02
per 1M tokens). Without it, Brains still work using keyword matching. Groq has no
embeddings endpoint, so it can't provide this.

### New API surface
`GET/POST /api/brains`, `DELETE /api/brains/:id`,
`GET/POST /api/brains/:id/documents`, `DELETE /api/brains/:id/documents/:docId`,
`GET /api/auth/me`. Chat accepts `{ brainId, routingMode }`.

### Scaling note
Ranking is done in-process, which is ideal up to a few thousand chunks. Beyond
that, move ranking to a real vector index (Turso vector columns, Qdrant, or
Pinecone) — only `services/rag.js` changes.

## Still open (nice-to-haves)
- **PDF/DOCX ingestion:** currently paste or `.txt`/`.md`. Add server-side
  parsing (e.g. `pdf-parse`) in `routes/brains.js` to accept those.
- **Streaming responses** and **persistent cross-chat memory**.

## Admin Dashboard

A full admin portal at **/admin** (reachable from the avatar menu → Admin Portal).

**Become an admin:** set `ADMIN_EMAILS=your@email.com` in your env (local + Vercel),
then log in with that account. From there you can create or promote more admins in
the dashboard (the "Admins" panel).

**What it shows (all live from your DB):**
- **Stat cards:** users, active (30d), new today, conversations, messages, documents,
  chunks, brains, admins.
- **Activity charts:** daily signups and daily messages (7d).
- **Retrieval Analytics (30d):** semantic hits vs keyword fallback, zero-result rate,
  clarifications, avg latency, errors, and 👍/👎 Helpful % — powered by a new
  `retrieval_events` row logged on every turn and `message_feedback` from the thumbs
  buttons now shown under each answer.
- **User management:** search, Export CSV, reset password (returns a temp password),
  and Suspend / Disable / Terminate / Delete. Non-active accounts are blocked at login.

**New endpoints:** `GET /api/admin/stats`, `GET /api/admin/analytics`,
`GET /api/admin/users`, `POST /api/admin/users/:id/status`,
`POST /api/admin/users/:id/reset-password`, `DELETE /api/admin/users/:id`,
`GET/POST /api/admin/admins`, `DELETE /api/admin/admins/:id`,
plus `POST /api/chat/conversations/:id/messages/:msgId/feedback`. All admin routes
require the `requireAdmin` middleware.

**Appearance:** the avatar menu also has a Light / System / Dark theme toggle
(persisted per browser).
