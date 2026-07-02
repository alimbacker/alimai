# Alim AI (starter clone)

A multi-model AI chat platform: React frontend, Node/Express backend, SQLite storage
(via Node's built-in `node:sqlite` — no native compilation needed), JWT auth, and a
**model router** that lets you plug in multiple AI providers and switch between them
per message.

## How it's built

```
alim-ai/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express app entry
│   │   ├── db.js                  # SQLite schema (users, conversations, messages)
│   │   ├── middleware/auth.js     # JWT verification
│   │   ├── routes/
│   │   │   ├── auth.js            # /api/auth/register, /login
│   │   │   ├── models.js          # /api/models — lists models with configured keys
│   │   │   └── chat.js            # /api/chat/... — conversations + send message
│   │   └── services/
│   │       ├── modelRegistry.js   # every model the app knows about
│   │       ├── modelRouter.js     # picks the right provider adapter and calls it
│   │       └── providers/
│   │           ├── anthropic.js   # Anthropic /v1/messages adapter
│   │           └── openai.js      # OpenAI /v1/chat/completions adapter
│   └── .env.example
└── frontend/
    └── src/
        ├── pages/Login.jsx, Register.jsx, Chat.jsx
        ├── components/ModelSelector.jsx, ChatMessage.jsx
        └── api.js                 # fetch wrapper for the backend
```

**The multi-model routing works like this:** `modelRegistry.js` lists every model
(id, provider, display label, which env var holds its key). `/api/models` only returns
models whose key is actually set, so the dropdown never shows a dead option.
`modelRouter.js` is the single place that maps a model id to a provider adapter and
calls it. To add a new provider (Google, Mistral, a local model, etc.), you only need
to: add an entry to `modelRegistry.js` and write one adapter file with a
`sendMessage(modelId, messages)` function — nothing else changes.

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `JWT_SECRET` — any long random string
- `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` — add at least one to get a working model

Then run:

```bash
npm run dev
```

The API runs on `http://localhost:4000`. It creates `alim.sqlite` automatically on
first run — no separate DB setup needed.

> Requires **Node 22.5+** (uses the built-in `node:sqlite` module). Check with `node -v`.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). It proxies `/api` requests
to the backend automatically (see `vite.config.js`), so no CORS setup is needed in dev.

### 3. Try it

1. Register an account
2. Pick a model from the dropdown (only models with a configured API key appear)
3. Send a message — it's saved to SQLite and routed to the right provider

## Where to go next (memory & retrieval — not built yet)

You mentioned multi-model routing mattered most for this first pass, so that's what's
built and working. The two other pieces from the original brief aren't in here yet:

- **Persistent memory**: the DB already stores full conversation history per user, so
  "remembering past conversations" mostly means: on each new chat, pull a summary of
  the user's last few conversations and prepend it to the message history sent to the
  model. That's a small addition to `routes/chat.js`.
- **RAG / retrieval**: would need a documents table, a chunking step, and embeddings
  (Anthropic doesn't serve embeddings — you'd need OpenAI's or a local model like
  `all-MiniLM`) stored in a vector index (sqlite-vec works well alongside the sqlite
  setup here, or Pinecone/Qdrant if you want a hosted option).

Happy to build either of those next once this base is running for you.
