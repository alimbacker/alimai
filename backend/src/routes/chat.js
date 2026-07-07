import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { get, all, run } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { routeMessage } from "../services/modelRouter.js";
import { resolveTier } from "../services/modelRegistry.js";
import { retrieveForBrain, retrieveSmart, buildSystemPrompt, DEFAULT_SYSTEM_PROMPT } from "../services/rag.js";
import { embeddingsAvailable } from "../services/embeddings.js";

const router = Router();
router.use(requireAuth);

router.get("/conversations", async (req, res) => {
  try {
    const rows = await all(
      "SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC",
      [req.userId]
    );
    res.json({ conversations: rows });
  } catch (err) {
    console.error("list conversations failed:", err);
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.post("/conversations", async (req, res) => {
  try {
    const id = uuidv4();
    await run("INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)", [
      id, req.userId, req.body?.title || "New chat",
    ]);
    res.json({ id });
  } catch (err) {
    console.error("create conversation failed:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const convo = await get("SELECT * FROM conversations WHERE id = ? AND user_id = ?", [
      req.params.id, req.userId,
    ]);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });
    const messages = await all(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json({ messages });
  } catch (err) {
    console.error("load messages failed:", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// Send a message. Body: { content, modelId, brainId?, routingMode? }
//   routingMode: "smart" (search all brains) | "manual" (use brainId) | "none" (no RAG)
router.post("/conversations/:id/messages", async (req, res) => {
  const { content, tier, modelId, brainId, routingMode = "smart" } = req.body ?? {};
  if (!content) return res.status(400).json({ error: "content is required" });
  // The client sends an effort tier (low/medium/high); modelId is legacy fallback.
  const resolvedModel = resolveTier(tier || modelId || "medium");
  if (!resolvedModel) {
    return res.status(400).json({ error: "No AI model is configured on the server." });
  }

  const startedAt = Date.now();
  try {
    const convo = await get("SELECT * FROM conversations WHERE id = ? AND user_id = ?", [
      req.params.id, req.userId,
    ]);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });

    // Save the user's message
    const userMsgId = uuidv4();
    await run(
      "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)",
      [userMsgId, req.params.id, content]
    );

    // ---- RAG retrieval -----------------------------------------------------
    let hits = [];
    let usedBrain = null; // { id, name, emoji }
    if (routingMode !== "none") {
      if (routingMode === "manual" && brainId) {
        const brain = await get("SELECT * FROM brains WHERE id = ? AND (user_id = ? OR is_global = 1)", [brainId, req.userId]);
        if (brain) {
          hits = await retrieveForBrain(brain.id, content);
          usedBrain = { id: brain.id, name: brain.name, emoji: brain.emoji };
        }
      } else {
        const smart = await retrieveSmart(req.userId, content);
        hits = smart.hits;
        if (smart.brainId) {
          const brain = await get("SELECT * FROM brains WHERE id = ?", [smart.brainId]);
          if (brain) usedBrain = { id: brain.id, name: brain.name, emoji: brain.emoji };
        }
      }
    }

    // Conversation history in provider shape
    const history = await all(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );

    // Always prepend a system message: grounded (KB) when a brain matched, else a
    // concise-general prompt. Never persisted as a chat message.
    const systemContent = usedBrain
      ? buildSystemPrompt(usedBrain.name, hits)
      : DEFAULT_SYSTEM_PROMPT;
    const providerMessages = [{ role: "system", content: systemContent }, ...history];

    const { text, provider, model } = await routeMessage(resolvedModel, providerMessages);

    const assistantMsgId = uuidv4();
    await run(
      "INSERT INTO messages (id, conversation_id, role, content, provider, model, brain_id) VALUES (?, ?, 'assistant', ?, ?, ?, ?)",
      [assistantMsgId, req.params.id, text, provider, model, usedBrain?.id || null]
    );

    // --- analytics: one row per assistant turn (admin dashboard) ---
    const isClarification = /\b(could you (clarify|specify|elaborate)|can you (clarify|be more specific)|which .+ do you mean|need more (info|context|details)|what do you mean by)\b/i.test(text);
    try {
      await run(
        "INSERT INTO retrieval_events (id, user_id, conversation_id, mode, semantic, hit_count, clarification, error, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
        [uuidv4(), req.userId, req.params.id, routingMode, embeddingsAvailable() ? 1 : 0, hits.length, isClarification ? 1 : 0, Date.now() - startedAt]
      );
    } catch (e) { console.error("event log failed:", e.message); }

    res.json({
      reply: {
        id: assistantMsgId, role: "assistant", content: text, provider, model,
        brain: usedBrain,                 // which brain answered (or null)
        sources: hits.map((h) => h.title), // source doc titles used
      },
    });
  } catch (err) {
    console.error("send message failed:", err);
    try {
      await run(
        "INSERT INTO retrieval_events (id, user_id, conversation_id, mode, semantic, hit_count, clarification, error, latency_ms) VALUES (?, ?, ?, ?, 0, 0, 0, 1, ?)",
        [uuidv4(), req.userId, req.params.id, req.body?.routingMode || "smart", Date.now() - startedAt]
      );
    } catch (e) { /* ignore */ }
    res.status(502).json({ error: err.message || "Failed to get a reply" });
  }
});

// Delete a conversation (and its messages). Must belong to the caller.
router.delete("/conversations/:id", async (req, res) => {
  try {
    const convo = await get("SELECT id FROM conversations WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });
    await run("DELETE FROM messages WHERE conversation_id = ?", [req.params.id]);
    await run("DELETE FROM conversations WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("delete conversation failed:", err);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// Thumbs up/down on an assistant message -> feeds Helpful % on the dashboard.
router.post("/conversations/:id/messages/:msgId/feedback", async (req, res) => {
  try {
    const { value, query } = req.body ?? {};
    if (![1, -1].includes(value)) return res.status(400).json({ error: "value must be 1 or -1" });
    const convo = await get("SELECT id FROM conversations WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });
    // one vote per user per message: replace any prior vote
    await run("DELETE FROM message_feedback WHERE message_id = ? AND user_id = ?", [req.params.msgId, req.userId]);
    await run("INSERT INTO message_feedback (id, message_id, user_id, value, query) VALUES (?, ?, ?, ?, ?)", [uuidv4(), req.params.msgId, req.userId, value, (query || "").slice(0, 300)]);
    res.json({ ok: true });
  } catch (err) {
    console.error("feedback failed:", err);
    res.status(500).json({ error: "Failed to record feedback" });
  }
});

export default router;
