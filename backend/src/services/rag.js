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

// Fallback when there are no embeddings: token-overlap score.
function keywordScore(query, text) {
  const q = new Set(
    query.toLowerCase().match(/[a-z0-9]{3,}/g) || []
  );
  if (!q.size) return 0;
  const words = text.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  let hits = 0;
  for (const w of words) if (q.has(w)) hits++;
  return hits / Math.sqrt(words.length + 1);
}

// ---- Retrieval --------------------------------------------------------------
// Returns [{ content, score, title }] for the top matches in a set of brains.
async function rankChunks(brainIds, query, k = TOP_K) {
  if (!brainIds.length) return [];
  const placeholders = brainIds.map(() => "?").join(",");
  const rows = await all(
    `SELECT c.content, c.embedding, d.title AS title, c.brain_id AS brainId
       FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.brain_id IN (${placeholders})`,
    brainIds
  );
  if (!rows.length) return [];

  let scored;
  if (embeddingsAvailable() && rows.some((r) => r.embedding)) {
    const qVec = await embedOne(query);
    scored = rows.map((r) => ({
      content: r.content,
      title: r.title,
      brainId: r.brainId,
      score: r.embedding ? cosineSim(qVec, JSON.parse(r.embedding)) : 0,
    }));
  } else {
    scored = rows.map((r) => ({
      content: r.content,
      title: r.title,
      brainId: r.brainId,
      score: keywordScore(query, r.content),
    }));
  }

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Manual mode: search one specific brain.
export async function retrieveForBrain(brainId, query, k = TOP_K) {
  return rankChunks([brainId], query, k);
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
  const hits = await rankChunks(ids, query, k);
  const winningBrainId = hits[0]?.brainId || null;
  return { hits, brainId: winningBrainId };
}

// ---- Prompt assembly --------------------------------------------------------
export function buildSystemPrompt(brainName, hits) {
  if (!hits.length) {
    return (
      `You are Alim AI. The user has a knowledge base but no relevant passages ` +
      `were found for this question. Answer normally, and if the question seems ` +
      `to rely on their private data, say you couldn't find it in their documents.`
    );
  }
  const context = hits
    .map((h, i) => `[Source ${i + 1} — ${h.title}]\n${h.content}`)
    .join("\n\n---\n\n");

  return (
    `You are Alim AI, answering using the user's "${brainName}" knowledge base.\n` +
    `Use ONLY the sources below to answer. If the answer isn't in them, say so ` +
    `plainly instead of inventing details. Cite sources inline like [Source 1] ` +
    `when you use them.\n\n` +
    `=== KNOWLEDGE BASE ===\n${context}\n=== END ===`
  );
}

export { TOP_K };
