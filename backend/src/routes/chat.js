import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { routeMessage } from "../services/modelRouter.js";

const router = Router();
router.use(requireAuth);

// List this user's conversations
router.get("/conversations", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(req.userId);
  res.json({ conversations: rows });
});

// Create a new conversation
router.post("/conversations", (req, res) => {
  const id = uuidv4();
  db.prepare("INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)").run(
    id,
    req.userId,
    req.body.title || "New chat"
  );
  res.json({ id });
});

// Get all messages in a conversation (must belong to this user)
router.get("/conversations/:id/messages", (req, res) => {
  const convo = db
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId);
  if (!convo) return res.status(404).json({ error: "Conversation not found" });

  const messages = db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(req.params.id);
  res.json({ messages });
});

// Send a message in a conversation, get back the AI reply.
// Body: { content: string, modelId: string }
router.post("/conversations/:id/messages", async (req, res) => {
  const { content, modelId } = req.body;
  if (!content || !modelId) {
    return res.status(400).json({ error: "content and modelId are required" });
  }

  const convo = db
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId);
  if (!convo) return res.status(404).json({ error: "Conversation not found" });

  // Save the user's message
  const userMsgId = uuidv4();
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)"
  ).run(userMsgId, req.params.id, content);

  // Build full history for context, in the {role, content} shape providers expect
  const history = db
    .prepare(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
    )
    .all(req.params.id);

  try {
    const { text, provider, model } = await routeMessage(modelId, history);

    const assistantMsgId = uuidv4();
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, provider, model) VALUES (?, ?, 'assistant', ?, ?, ?)"
    ).run(assistantMsgId, req.params.id, text, provider, model);

    res.json({
      reply: { id: assistantMsgId, role: "assistant", content: text, provider, model },
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
