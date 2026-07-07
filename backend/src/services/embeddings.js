// Embeddings provider for RAG. Provider is auto-selected by which key is set:
//   1. GEMINI_API_KEY  -> Google Gemini `gemini-embedding-001` (FREE tier via AI
//      Studio; no billing required). Preferred.
//   2. OPENAI_API_KEY  -> OpenAI `text-embedding-3-small`.
//   3. neither         -> null, and rag.js falls back to keyword matching.
//
// Groq has no embeddings endpoint, which is why one of the two keys above is
// needed for semantic (meaning-based) search.
//
// Get a free Gemini key: https://aistudio.google.com/apikey
// Embeddings from different providers/models are NOT comparable — if you switch
// providers you must re-add (re-index) your documents.

const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const openaiKey = () => process.env.OPENAI_API_KEY;

const GEMINI_MODEL = "gemini-embedding-001";
const OPENAI_MODEL = "text-embedding-3-small";

export function embeddingsProvider() {
  if (geminiKey()) return "gemini";
  if (openaiKey()) return "openai";
  return null;
}
export function embeddingsAvailable() {
  return embeddingsProvider() !== null;
}

// texts: string[] -> number[][]  (null if no provider configured).
// taskType: "document" (indexing) | "query" (search). Only affects Gemini, where
// the asymmetric RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY types improve retrieval.
export async function embed(texts, taskType = "document") {
  const provider = embeddingsProvider();
  if (!provider) return null;
  if (!texts.length) return [];
  return provider === "gemini" ? embedGemini(texts, taskType) : embedOpenAI(texts);
}

export async function embedOne(text, taskType = "query") {
  const out = await embed([text], taskType);
  return out ? out[0] : null;
}

// ---- Gemini (Google Generative Language API, v1beta) ------------------------
async function geminiRequest(method, body, attempt = 0) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
      body: JSON.stringify(body),
    }
  );
  // Free tier is rate-limited; back off briefly and retry a couple of times.
  if (res.status === 429 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return geminiRequest(method, body, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Gemini embeddings error (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function embedGemini(texts, taskType) {
  const gTask = taskType === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
  const BATCH = 100; // keep each batchEmbedContents call comfortably within limits
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    // Note: we intentionally do NOT send outputDimensionality — some API
    // versions reject it on batchEmbedContents. Default dimensions are fine;
    // cosine similarity is dimension-agnostic as long as query + docs match.
    const data = await geminiRequest("batchEmbedContents", {
      requests: slice.map((t) => ({
        model: `models/${GEMINI_MODEL}`,
        content: { parts: [{ text: t }] },
        taskType: gTask,
      })),
    });
    for (const e of data.embeddings) out.push(e.values);
  }
  return out;
}

// ---- OpenAI -----------------------------------------------------------------
async function embedOpenAI(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey()}`,
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings error (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
