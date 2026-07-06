// Storage layer — libSQL / Turso (SQLite-compatible, works on serverless).
//
// Why not Node's built-in `node:sqlite` anymore? That writes a file to the
// local disk, and Vercel's function filesystem is read-only (except /tmp, which
// is wiped between cold starts). So a file-based DB either crashes on boot or
// silently loses every user between requests. libSQL talks to a hosted Turso DB
// over HTTP, which is exactly what a stateless serverless function needs.
//
//  - Local dev:  leave TURSO_DATABASE_URL unset -> uses a local file `alim.sqlite`.
//  - Production: set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (free at turso.tech).
//
// The SQL is unchanged from the original SQLite schema — libSQL *is* SQLite.
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:alim.sqlite";
const authToken = process.env.TURSO_AUTH_TOKEN;

// Fail loudly with a useful message instead of a cryptic read-only-FS crash.
if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
  throw new Error(
    "TURSO_DATABASE_URL is not set. On Vercel you must use a hosted database. " +
      "Create a free DB at https://turso.tech and add TURSO_DATABASE_URL and " +
      "TURSO_AUTH_TOKEN to your Vercel project's Environment Variables."
  );
}

const client = createClient(authToken ? { url, authToken } : { url });

// Create tables if they don't exist. Idempotent; runs once per cold start.
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
`);

// Thin async helpers mirroring the small slice of the old sync API the routes used.
// (libSQL is network-backed, so every call is async — routes now `await` these.)
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
