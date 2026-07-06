import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { get, all, run } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { routeMessage } from "../services/modelRouter.js";

const router = Router();
router.use(requireAuth);

// List this user's conversations
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

// Create a new conversation
router.post("/conversations", async (req, res) => {
  try {
    const id = uuidv4();
    await run("INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)", [
      id,
      req.userId,
      req.body?.title || "New chat",
    ]);
    res.json({ id });
  } catch (err) {
    console.error("create conversation failed:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get all messages in a conversation (must belong to this user)
router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const convo = await get("SELECT * FROM conversations WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.userId,
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

// Send a message in a conversation, get back the AI reply.
// Body: { content: string, modelId: string }
router.post("/conversations/:id/messages", async (req, res) => {
  const { content, modelId } = req.body ?? {};
  if (!content || !modelId) {
    return res.status(400).json({ error: "content and modelId are required" });
  }

  try {
    const convo = await get("SELECT * FROM conversations WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.userId,
    ]);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });

    // Save the user's message
    const userMsgId = uuidv4();
    await run(
      "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)",
      [userMsgId, req.params.id, content]
    );

    // Build full history for context, in the {role, content} shape providers expect
    const history = await all(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );

    const { text, provider, model } = await routeMessage(modelId, history);

    const assistantMsgId = uuidv4();
    await run(
      "INSERT INTO messages (id, conversation_id, role, content, provider, model) VALUES (?, ?, 'assistant', ?, ?, ?)",
      [assistantMsgId, req.params.id, text, provider, model]
    );

    res.json({
      reply: { id: assistantMsgId, role: "assistant", content: text, provider, model },
    });
  } catch (err) {
    console.error("send message failed:", err);
    // 502 for upstream provider errors, 500 for our own DB errors — both surface a message.
    res.status(502).json({ error: err.message || "Failed to get a reply" });
  }
});

export default router;
