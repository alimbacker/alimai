// Storage layer — libSQL / Turso (SQLite-compatible, works on serverless).
//
//  - Local dev:  leave TURSO_DATABASE_URL unset -> uses a local file `alim.sqlite`.
//  - Production: set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (free at turso.tech).
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:alim.sqlite";
const authToken = process.env.TURSO_AUTH_TOKEN;

if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
  throw new Error(
    "TURSO_DATABASE_URL is not set. On Vercel you must use a hosted database. " +
      "Create a free DB at https://turso.tech and add TURSO_DATABASE_URL and " +
      "TURSO_AUTH_TOKEN to your Vercel project's Environment Variables."
  );
}

const client = createClient(authToken ? { url, authToken } : { url });

// Core tables (idempotent).
await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT 'New chat',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  -- ===== RAG / "Brains" =====
  -- A Brain is a named knowledge base (like HajiHaz's "Legal Brain").
  CREATE TABLE IF NOT EXISTS brains (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🧠',
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  -- A Document is one uploaded/pasted source inside a Brain.
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    brain_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT DEFAULT 'paste',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brain_id) REFERENCES brains(id)
  );
  -- A Chunk is a searchable slice of a Document. embedding is a JSON array of
  -- floats (or NULL when no embedding provider is configured -> keyword fallback).
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    brain_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (brain_id) REFERENCES brains(id)
  );
  CREATE INDEX IF NOT EXISTS idx_chunks_brain ON chunks(brain_id);
  CREATE INDEX IF NOT EXISTS idx_docs_brain ON documents(brain_id);

  -- ===== Admin analytics =====
  -- One row per assistant turn: powers Retrieval Analytics on the admin dashboard.
  CREATE TABLE IF NOT EXISTS retrieval_events (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    conversation_id TEXT,
    mode TEXT,
    semantic INTEGER DEFAULT 0,
    hit_count INTEGER DEFAULT 0,
    clarification INTEGER DEFAULT 0,
    error INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  -- Thumbs up/down on assistant messages -> Helpful %.
  CREATE TABLE IF NOT EXISTS message_feedback (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    user_id TEXT,
    value INTEGER NOT NULL,
    query TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_events_created ON retrieval_events(created_at);
`);

// Guarded migration: add brain_id to conversations for existing deployments.
// SQLite has no "ADD COLUMN IF NOT EXISTS", so we try and swallow the dup error.
async function addColumnIfMissing(table, columnDef) {
  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}
await addColumnIfMissing("conversations", "brain_id TEXT");
await addColumnIfMissing("conversations", "routing_mode TEXT DEFAULT 'smart'");
await addColumnIfMissing("messages", "brain_id TEXT");
await addColumnIfMissing("users", "is_admin INTEGER DEFAULT 0");
await addColumnIfMissing("users", "status TEXT DEFAULT 'active'");
await addColumnIfMissing("users", "last_login TEXT");

export async function get(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows[0] ?? null;
}
export async function all(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows;
}
export async function run(sql, args = []) {
  return client.execute({ sql, args });
}
export default client;
