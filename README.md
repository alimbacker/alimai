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

## Not built yet (from the original brief)

- **Persistent memory across chats:** the DB already stores full history per user, so this
  is mostly: summarize the user's recent conversations and prepend to the message list in
  `routes/chat.js`.
- **RAG / retrieval:** would need a documents table, chunking, embeddings (OpenAI's or a
  local model), and a vector index (Turso supports vector columns, or use Pinecone/Qdrant).
