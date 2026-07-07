// Embeddings provider for RAG.
//
// Primary: OpenAI `text-embedding-3-small` (cheap: ~$0.02 / 1M tokens).
// Requires OPENAI_API_KEY. Note: Groq does NOT offer an embeddings endpoint,
// so if you only have a Groq key, we fall back to keyword search (see rag.js).
//
// Want a free/self-hosted embedder instead? Swap the fetch below for Jina
// (https://api.jina.ai/v1/embeddings) or a local model — the rest of the code
// only cares that embed() returns number[][].

const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const EMBED_MODEL = "text-embedding-3-small";

export function embeddingsAvailable() {
  return !!process.env.OPENAI_API_KEY;
}

// texts: string[]  ->  number[][]   (returns null if no provider configured)
export async function embed(texts) {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!texts.length) return [];

  const res = await fetch(OPENAI_EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embeddings API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  // Preserve input order (OpenAI returns an `index` on each item).
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function embedOne(text) {
  const out = await embed([text]);
  return out ? out[0] : null;
}
