import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { get, all, run } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { chunkText } from "../services/rag.js";
import { embed, embeddingsAvailable } from "../services/embeddings.js";
import { reindexBrain } from "../services/reindex.js";

const router = Router();
router.use(requireAuth);

// Ownership guard: fetch a brain only if it belongs to the caller.
async function ownedBrain(brainId, userId) {
  return get("SELECT * FROM brains WHERE id = ? AND user_id = ?", [brainId, userId]);
}

// List brains (with a document count for the UI).
router.get("/", async (req, res) => {
  try {
    const rows = await all(
      `SELECT b.*,
              (SELECT COUNT(*) FROM documents d WHERE d.brain_id = b.id) AS doc_count
         FROM brains b WHERE b.user_id = ? OR b.is_global = 1
         ORDER BY b.is_global DESC, b.created_at ASC`,
      [req.userId]
    );
    res.json({ brains: rows, embeddings: embeddingsAvailable() });
  } catch (err) {
    console.error("list brains failed:", err);
    res.status(500).json({ error: "Failed to load brains" });
  }
});

// Create a brain.
router.post("/", async (req, res) => {
  try {
    const { name, emoji, description } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: "Brain name is required" });
    const id = uuidv4();
    await run(
      "INSERT INTO brains (id, user_id, name, emoji, description) VALUES (?, ?, ?, ?, ?)",
      [id, req.userId, name.trim(), emoji || "🧠", description || ""]
    );
    res.json({ brain: { id, name: name.trim(), emoji: emoji || "🧠", description: description || "", doc_count: 0 } });
  } catch (err) {
    console.error("create brain failed:", err);
    res.status(500).json({ error: "Failed to create brain" });
  }
});

// Delete a brain and everything in it.
router.delete("/:id", async (req, res) => {
  try {
    const brain = await ownedBrain(req.params.id, req.userId);
    if (!brain) return res.status(404).json({ error: "Brain not found" });
    await run("DELETE FROM chunks WHERE brain_id = ?", [req.params.id]);
    await run("DELETE FROM documents WHERE brain_id = ?", [req.params.id]);
    await run("DELETE FROM brains WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("delete brain failed:", err);
    res.status(500).json({ error: "Failed to delete brain" });
  }
});

// List documents in a brain.
router.get("/:id/documents", async (req, res) => {
  try {
    const brain = await ownedBrain(req.params.id, req.userId);
    if (!brain) return res.status(404).json({ error: "Brain not found" });
    const docs = await all(
      `SELECT d.id, d.title, d.source, d.created_at,
              (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count
         FROM documents d WHERE d.brain_id = ? ORDER BY d.created_at DESC`,
      [req.params.id]
    );
    res.json({ documents: docs });
  } catch (err) {
    console.error("list documents failed:", err);
    res.status(500).json({ error: "Failed to load documents" });
  }
});

// Add a document to a brain: chunk -> embed -> store. This is "teach the AI my data".
// Body: { title: string, text: string, source?: string }
router.post("/:id/documents", async (req, res) => {
  try {
    const brain = await ownedBrain(req.params.id, req.userId);
    if (!brain) return res.status(404).json({ error: "Brain not found" });

    const { title, text, source } = req.body ?? {};
    if (!text?.trim()) return res.status(400).json({ error: "Document text is required" });

    const chunks = chunkText(text);
    if (!chunks.length) return res.status(400).json({ error: "Nothing to index in that text" });
    if (chunks.length > 400) {
      return res.status(413).json({ error: `Too large (${chunks.length} chunks). Split it into smaller documents.` });
    }

    const docId = uuidv4();
    await run(
      "INSERT INTO documents (id, brain_id, title, source) VALUES (?, ?, ?, ?)",
      [docId, brain.id, (title || "Untitled").slice(0, 200), source || "paste"]
    );

    // Embed all chunks in one call (null if no embeddings provider -> keyword mode).
    let vectors = null;
    try {
      vectors = await embed(chunks);
    } catch (e) {
      console.error("embedding failed, storing without vectors:", e.message);
    }

    for (let i = 0; i < chunks.length; i++) {
      await run(
        "INSERT INTO chunks (id, document_id, brain_id, content, embedding) VALUES (?, ?, ?, ?, ?)",
        [uuidv4(), docId, brain.id, chunks[i], vectors ? JSON.stringify(vectors[i]) : null]
      );
    }

    res.json({
      document: { id: docId, title: title || "Untitled", chunk_count: chunks.length },
      embedded: !!vectors,
    });
  } catch (err) {
    console.error("add document failed:", err);
    res.status(500).json({ error: err.message || "Failed to add document" });
  }
});

// Delete a single document (and its chunks).
router.delete("/:id/documents/:docId", async (req, res) => {
  try {
    const brain = await ownedBrain(req.params.id, req.userId);
    if (!brain) return res.status(404).json({ error: "Brain not found" });
    await run("DELETE FROM chunks WHERE document_id = ?", [req.params.docId]);
    await run("DELETE FROM documents WHERE id = ? AND brain_id = ?", [req.params.docId, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("delete document failed:", err);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// Re-embed all documents in a brain (after adding/switching an embeddings key).
router.post("/:id/reindex", async (req, res) => {
  try {
    const brain = await ownedBrain(req.params.id, req.userId);
    if (!brain) return res.status(404).json({ error: "Brain not found" });
    const result = await reindexBrain(brain.id);
    res.json(result);
  } catch (err) {
    console.error("reindex failed:", err);
    res.status(500).json({ error: err.message || "Failed to re-index" });
  }
});

export default router;
