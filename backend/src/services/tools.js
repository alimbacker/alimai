// Tools the assistant can actually run. Each tool takes (args, ctx) where ctx
// has { userId }, and returns a short string "observation" the model reads back.
//
// These act on things this web app genuinely controls: the user's files stored
// in Alim (Brains/documents) and outbound email. They deliberately do NOT claim
// to touch the phone, camera roll, SMS, or WhatsApp — a browser app can't.
import { get, all, run } from "../db.js";
import { retrieveSmart } from "./rag.js";
import { webSearch, webSearchAvailable } from "./webSearch.js";

// ---- tool catalog (shown to the model) -------------------------------------
export const TOOLS = [
  {
    name: "get_time",
    destructive: false,
    describe: "get_time() — the current date and time.",
  },
  {
    name: "web_search",
    destructive: false,
    describe: 'web_search({"query": "..."}) — search the live web for current info (news, prices, who holds a role).',
  },
  {
    name: "search_knowledge",
    destructive: false,
    describe: 'search_knowledge({"query": "..."}) — search the user\'s own uploaded Brains/documents.',
  },
  {
    name: "list_files",
    destructive: false,
    describe: 'list_files({"query": "optional filter"}) — list files/images/documents the user has stored in Alim, with their ids. Use this to find something before deleting it.',
  },
  {
    name: "delete_file",
    destructive: true,
    describe: 'delete_file({"document_id": "..."}) — permanently delete one stored file/document by id. Destructive: confirm with the user first.',
  },
  {
    name: "send_email",
    destructive: true,
    describe: 'send_email({"to": "email", "subject": "...", "body": "..."}) — send a real email to a person. Destructive/irreversible: confirm with the user first.',
  },
];

// A compact catalog string for the system prompt.
export function toolCatalog() {
  return TOOLS.map((t) => `- ${t.describe}`).join("\n");
}
export function isDestructive(name) {
  return TOOLS.find((t) => t.name === name)?.destructive === true;
}

// ---- dispatcher ------------------------------------------------------------
export async function runTool(name, args = {}, ctx = {}) {
  try {
    switch (name) {
      case "get_time": return toolGetTime();
      case "web_search": return await toolWebSearch(args);
      case "search_knowledge": return await toolSearchKnowledge(args, ctx);
      case "list_files": return await toolListFiles(args, ctx);
      case "delete_file": return await toolDeleteFile(args, ctx);
      case "send_email": return await toolSendEmail(args, ctx);
      default: return `Unknown tool "${name}". Available: ${TOOLS.map((t) => t.name).join(", ")}.`;
    }
  } catch (err) {
    console.error(`tool ${name} failed:`, err);
    return `The ${name} action failed: ${err.message}`;
  }
}

// ---- implementations -------------------------------------------------------
function toolGetTime() {
  const now = new Date();
  return `It is ${now.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} (server time).`;
}

async function toolWebSearch(args) {
  const query = (args.query || "").trim();
  if (!query) return "No search query was provided.";
  if (!webSearchAvailable()) return "Web search isn't configured on this server (no search API key).";
  const results = await webSearch(query, { maxResults: 5 });
  if (!results.length) return `No web results found for "${query}".`;
  return results.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}\n${r.content}`).join("\n\n");
}

async function toolSearchKnowledge(args, ctx) {
  const query = (args.query || "").trim();
  if (!query) return "No query was provided.";
  const { hits, grounded } = await retrieveSmart(ctx.userId, query);
  if (!hits.length) return `Nothing in the user's Brains matched "${query}".`;
  const body = hits.slice(0, 4).map((h, i) => `[${i + 1}] (${h.title}) ${h.content.slice(0, 300)}`).join("\n\n");
  return (grounded ? "" : "(weak match) ") + body;
}

async function toolListFiles(args, ctx) {
  const filter = (args.query || "").trim().toLowerCase();
  const rows = await all(
    `SELECT d.id, d.title, d.source, b.name AS brain, b.emoji
       FROM documents d JOIN brains b ON b.id = d.brain_id
      WHERE b.user_id = ?
      ORDER BY d.created_at DESC`,
    [ctx.userId]
  );
  const list = filter ? rows.filter((r) => (r.title || "").toLowerCase().includes(filter)) : rows;
  if (!list.length) return filter ? `No files match "${args.query}".` : "The user has no stored files yet.";
  return list
    .slice(0, 25)
    .map((r) => `• "${r.title}" — in ${r.emoji || ""} ${r.brain} [id: ${r.id}]`)
    .join("\n");
}

async function toolDeleteFile(args, ctx) {
  const id = (args.document_id || args.id || "").trim();
  if (!id) return "No document_id was provided. Use list_files to find the id first.";
  // Only allow deleting files inside the user's OWN brains.
  const doc = await get(
    `SELECT d.id, d.title FROM documents d JOIN brains b ON b.id = d.brain_id
      WHERE d.id = ? AND b.user_id = ?`,
    [id, ctx.userId]
  );
  if (!doc) return `No file with id ${id} belongs to this user (can't delete it).`;
  await run("DELETE FROM chunks WHERE document_id = ?", [id]);
  await run("DELETE FROM documents WHERE id = ?", [id]);
  return `Deleted "${doc.title}".`;
}

async function toolSendEmail(args, ctx) {
  const to = (args.to || "").trim();
  const subject = (args.subject || "(no subject)").trim();
  const body = (args.body || "").trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return "A valid recipient email ('to') is required.";
  if (!body) return "The email body is empty — nothing to send.";

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return "Email sending isn't set up on the server. Add RESEND_API_KEY (free at resend.com) and RESEND_FROM to enable it.";
  }
  const from = process.env.RESEND_FROM || "Alim AI <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text: body }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    return `Email failed to send (${res.status}): ${detail}`;
  }
  return `Email sent to ${to} with subject "${subject}".`;
}
