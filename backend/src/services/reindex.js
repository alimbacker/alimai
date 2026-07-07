// Re-embed every chunk in a brain with the currently-configured embeddings
// provider. Use after adding/switching an embeddings key so old documents
// (indexed in keyword mode) become semantically searchable.
import { all, run } from "../db.js";
import { embed } from "./embeddings.js";

export async function reindexBrain(brainId) {
  const chunks = await all("SELECT id, content FROM chunks WHERE brain_id = ?", [brainId]);
  if (!chunks.length) return { chunks: 0, embedded: false };

  const vectors = await embed(chunks.map((c) => c.content), "document");
  if (!vectors) return { chunks: chunks.length, embedded: false }; // no provider configured

  for (let i = 0; i < chunks.length; i++) {
    await run("UPDATE chunks SET embedding = ? WHERE id = ?", [JSON.stringify(vectors[i]), chunks[i].id]);
  }
  return { chunks: chunks.length, embedded: true };
}
