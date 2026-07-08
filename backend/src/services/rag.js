// Retrieval-Augmented Generation core.
//
// Flow: on each user message we (1) find the most relevant chunks from the
// chosen Brain, (2) format them into a system prompt, (3) prepend that to the
// conversation before it goes to the model. The model then answers grounded in
// YOUR documents instead of guessing.
//
// Vector search is done in Node with cosine similarity. For a personal / SMB
// knowledge base (hundreds–low-thousands of chunks) this is plenty fast and
// avoids depending on a specific vector-DB extension. To scale to 100k+ chunks,
// move ranking into a real vector index (Turso vector columns, Qdrant, etc.).

import { all } from "../db.js";
import { embed, embedOne, embeddingsAvailable } from "./embeddings.js";

const CHUNK_CHARS = 1100; // ~250-300 tokens per chunk
const CHUNK_OVERLAP = 180; // carry context across the seam
const TOP_K = 5;

// Two different bars, because "include this chunk as context" and "this brain
// actually answers the question" are different decisions:
//
//   *_INCLUDE  — once we've decided a brain is relevant, pull in chunks at/above
//                this score as supporting context.
//   *_ROUTE    — the STRONGEST hit must clear this (higher) bar for Smart mode to
//                route to a brain at all. If the best hit is only weakly related,
//                we DON'T ground — we answer from general knowledge instead of
//                refusing with "not in my knowledge base".
//
// Semantic scores are cosine similarity (0-1). Keyword scores are query-coverage
// (0-1): the fraction of the query's *content* words present in the chunk.
// All four are overridable via env so you can tune per embedding model without
// editing code.
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const MIN_SEMANTIC_SCORE   = num(process.env.MIN_SEMANTIC_SCORE,   0.55); // include
const ROUTE_SEMANTIC_SCORE = num(process.env.ROUTE_SEMANTIC_SCORE, 0.68); // gate to route
const MIN_KEYWORD_SCORE    = num(process.env.MIN_KEYWORD_SCORE,    0.34); // include
const ROUTE_KEYWORD_SCORE  = num(process.env.ROUTE_KEYWORD_SCORE,  0.5);  // gate to route

// Common words that carry no topic signal. Without this, a query like
// "tell about csk" matches a résumé purely because the words "tell"/"about"
// appear in it — which is exactly what made Smart routing misfire.
const STOPWORDS = new Set([
  "the","and","for","are","but","not","you","your","yours","with","that","this",
  "these","those","from","have","has","had","was","were","will","would","could",
  "should","can","cant","cannot","about","into","over","under","then","than","them",
  "they","their","there","here","what","when","where","which","who","whom","whose",
  "why","how","all","any","some","few","more","most","other","such","only","own",
  "same","too","very","just","also","been","being","its","it's","his","her","hers",
  "him","she","our","ours","out","off","per","via","tell","give","show","get","got",
  "let","list","find","need","want","know","like","make","made","does","did","done",
  "please","help","full","name","details","detail","info","information","thing","things",
]);

// ---- Chunking ---------------------------------------------------------------
// Split on blank lines first (keeps paragraphs whole), then pack paragraphs
// into ~CHUNK_CHARS windows with a little overlap.
export function chunkText(text) {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";

  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim());
    // start next buffer with the tail of this one for overlap
    buf = buf.length > CHUNK_OVERLAP ? buf.slice(-CHUNK_OVERLAP) : "";
  };

  for (const para of paragraphs) {
    if (para.length > CHUNK_CHARS) {
      // very long paragraph: hard-split it
      flush();
      buf = "";
      for (let i = 0; i < para.length; i += CHUNK_CHARS - CHUNK_OVERLAP) {
        chunks.push(para.slice(i, i + CHUNK_CHARS).trim());
      }
      continue;
    }
    if ((buf + "\n\n" + para).length > CHUNK_CHARS) flush();
    buf = buf ? buf + "\n\n" + para : para;
  }
  if (buf.trim()) chunks.push(buf.trim());

  // de-dupe tiny trailing fragments
  return chunks.filter((c) => c.length > 20);
}

// ---- Similarity -------------------------------------------------------------
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0; // different model/dims -> not comparable
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Content words only: 3+ chars, not a stopword. This is what makes keyword
// routing meaningful — "tell"/"about"/"the" no longer count as matches.
function contentTokens(s) {
  return (s.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOPWORDS.has(w));
}

// Fallback when there are no embeddings: query COVERAGE, in [0,1] — the fraction
// of the query's content words that appear in the chunk. A query whose only
// meaningful word is absent scores 0 (so it won't falsely ground a brain).
function keywordScore(query, text) {
  const q = new Set(contentTokens(query));
  if (!q.size) return 0; // nothing meaningful to match on -> not a KB question
  const words = new Set(contentTokens(text));
  if (!words.size) return 0;
  let covered = 0;
  for (const term of q) if (words.has(term)) covered++;
  return covered / q.size;
}

// ---- Retrieval --------------------------------------------------------------
// Returns { hits, top, semantic }:
//   hits     — [{ content, score, title, brainId }] at/above the INCLUDE floor,
//              best first (context to feed the model once we decide to ground).
//   top      — the single best raw score, even if no chunk cleared the floor.
//              Callers gate routing on this against the ROUTE bar.
//   semantic — true if semantic (cosine) scoring was used, false if keyword.
async function rankChunks(brainIds, query, k = TOP_K) {
  if (!brainIds.length) return { hits: [], top: 0, semantic: false };
  const placeholders = brainIds.map(() => "?").join(",");
  const rows = await all(
    `SELECT c.content, c.embedding, d.title AS title, c.brain_id AS brainId
       FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.brain_id IN (${placeholders})`,
    brainIds
  );
  if (!rows.length) return { hits: [], top: 0, semantic: false };

  // Try semantic search, but NEVER let an embeddings failure break the chat:
  // if embedding the query throws (bad key, rate limit, API down), fall back to
  // keyword search for this request instead of erroring out.
  let qVec = null;
  const wantSemantic = embeddingsAvailable() && rows.some((r) => r.embedding);
  if (wantSemantic) {
    try {
      qVec = await embedOne(query);
    } catch (err) {
      console.error("query embedding failed — falling back to keyword search:", err.message);
      qVec = null;
    }
  }

  const semantic = Boolean(qVec);
  const includeFloor = semantic ? MIN_SEMANTIC_SCORE : MIN_KEYWORD_SCORE;
  const scored = rows.map((r) => ({
    content: r.content,
    title: r.title,
    brainId: r.brainId,
    score: semantic
      ? (r.embedding ? cosineSim(qVec, JSON.parse(r.embedding)) : 0)
      : keywordScore(query, r.content),
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored.length ? scored[0].score : 0;
  const hits = scored.filter((s) => s.score >= includeFloor).slice(0, k);
  return { hits, top, semantic };
}

// The score the STRONGEST hit must reach for a brain to be considered a real
// match (route gate). Depends on whether scoring was semantic or keyword.
function routeGate(semantic) {
  return semantic ? ROUTE_SEMANTIC_SCORE : ROUTE_KEYWORD_SCORE;
}

// Manual mode: search one specific brain. The user explicitly pinned this brain,
// so we return whatever context we found; `grounded` reflects confidence but the
// caller may still pin. Empty hits -> buildSystemPrompt emits a clean "not in
// this knowledge base" reply.
export async function retrieveForBrain(brainId, query, k = TOP_K) {
  const { hits, top, semantic } = await rankChunks([brainId], query, k);
  return { hits, grounded: top >= routeGate(semantic) && hits.length > 0, top, semantic };
}

// Smart mode: search across ALL the user's brains, then report which brain the
// best hits came from (so the UI can show "routed to Legal Brain").
export async function retrieveSmart(userId, query, k = TOP_K) {
  // The user's own brains PLUS any global/shared brains (admin-managed knowledge).
  const brains = await all(
    "SELECT id FROM brains WHERE user_id = ? OR is_global = 1",
    [userId]
  );
  const ids = brains.map((b) => b.id);
  const { hits, top, semantic } = await rankChunks(ids, query, k);

  // Auto-route ONLY when the best hit is a confident match. If it's weak or
  // absent, DON'T ground — return grounded:false so the caller answers from
  // general knowledge instead of replying "not in my knowledge base". This is
  // the whole point of Smart/auto-route, and the fix for questions the model
  // could otherwise answer (e.g. current events, general topics) being refused.
  const grounded = hits.length > 0 && top >= routeGate(semantic);
  return {
    hits: grounded ? hits : [],
    brainId: grounded ? (hits[0]?.brainId || null) : null,
    grounded,
    top,
    semantic,
  };
}

// ---- Prompt assembly --------------------------------------------------------
export function buildSystemPrompt(brainName, hits) {
  if (!hits.length) {
    return (
      `You are Alim AI. The user picked the "${brainName}" knowledge base, but nothing ` +
      `relevant to their question is in it. Reply in ONE short sentence saying you don't ` +
      `have that information in your knowledge base. Do not answer from general knowledge ` +
      `and do not make anything up.`
    );
  }
  const context = hits
    .map((h, i) => `[Source ${i + 1} — ${h.title}]\n${h.content}`)
    .join("\n\n---\n\n");

  return (
    `You are Alim AI. Answer the user's question using ONLY the sources below.\n` +
    `RULES:\n` +
    `- Be concise: a direct answer in a few sentences. Do not pad or over-explain.\n` +
    `- Use ONLY facts found in the sources. Never invent names, dates, numbers, or details.\n` +
    `- If the answer isn't in the sources, say so in one sentence and stop.\n` +
    `- Format as plain sentences or a short bullet list. No big tables, no HTML tags like <br>.\n` +
    `- Cite sources inline like [Source 1] when you use them.\n\n` +
    `=== KNOWLEDGE BASE ===\n${context}\n=== END ===`
  );
}

// Used when no knowledge base applies (general questions). Keeps answers tight
// and discourages the model from confidently inventing specifics.
export const DEFAULT_SYSTEM_PROMPT =
  "You are Alim AI, a concise, helpful assistant. Answer directly and briefly — " +
  "a few short sentences or a short bullet list. Only use a table when the user " +
  "explicitly asks for one. Never output raw HTML tags like <br>. Don't fabricate " +
  "specific facts, names, dates, or statistics; if you're not sure, say so plainly.";

export { TOP_K };
