import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { get, all, run } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { routeMessage } from "../services/modelRouter.js";
import { resolveTier } from "../services/modelRegistry.js";
import { retrieveForBrain, retrieveSmart, buildSystemPrompt, DEFAULT_SYSTEM_PROMPT } from "../services/rag.js";
import { embeddingsAvailable } from "../services/embeddings.js";
import { shouldWebSearch, webSearch, buildWebSearchPrompt } from "../services/webSearch.js";
import { runAgent } from "../services/agent.js";

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
  const { content, tier, modelId, brainId, routingMode = "smart", agent = false } = req.body ?? {};
  if (!content) return res.status(400).json({ error: "content is required" });
  const agentMode = agent === true;
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
    // IMPORTANT: retrieval must never break the reply. If anything here fails
    // (embeddings API down, DB hiccup, etc.) we log it and answer without a brain
    // rather than returning an error. This is why "No Brain" used to work but a
    // Brain/Smart query could fail.
    let hits = [];
    let usedBrain = null; // { id, name, emoji }
    try {
      if (!agentMode && routingMode !== "none") {
        if (routingMode === "manual" && brainId) {
          // Manual = the user explicitly pinned this brain. Answer from it; if
          // nothing relevant is found, buildSystemPrompt emits a clean "not in
          // this knowledge base" reply (that's the point of pinning).
          const brain = await get("SELECT * FROM brains WHERE id = ? AND (user_id = ? OR is_global = 1)", [brainId, req.userId]);
          if (brain) {
            const r = await retrieveForBrain(brain.id, content);
            hits = r.hits;
            usedBrain = { id: brain.id, name: brain.name, emoji: brain.emoji };
          }
        } else {
          // Smart = auto-route. Only ground to a brain when the match is
          // confident (retrieveSmart applies the route gate). Otherwise leave
          // usedBrain null so we answer from general knowledge instead of
          // refusing — no more "I don't have that in my knowledge base" for
          // questions a brain doesn't actually cover.
          const smart = await retrieveSmart(req.userId, content);
          if (smart.grounded && smart.brainId) {
            const brain = await get("SELECT * FROM brains WHERE id = ?", [smart.brainId]);
            if (brain) {
              hits = smart.hits;
              usedBrain = { id: brain.id, name: brain.name, emoji: brain.emoji };
            }
          }
        }
      }
    } catch (retrievalErr) {
      console.error("retrieval failed — answering without a brain:", retrievalErr.message);
      hits = [];
      usedBrain = null;
    }

    // ---- Web search (fresh info for general answers) -----------------------
    // Only when NOT grounded in a brain. Brain answers stay grounded in the
    // user's own documents; general answers get augmented with live web results
    // so time-sensitive questions aren't answered from stale model memory.
    // Never breaks the reply — any failure just falls back to a normal answer.
    let webResults = [];
    if (!agentMode && !usedBrain) {
      try {
        if (shouldWebSearch(content)) {
          webResults = await webSearch(content, { maxResults: 5 });
        }
      } catch (webErr) {
        console.error("web search step failed — answering without it:", webErr.message);
        webResults = [];
      }
    }

    // Conversation history in provider shape
    const history = await all(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );

    // Choose the system prompt. Never persisted as a chat message.
    //   brain matched      -> grounded in the user's documents
    //   web results found  -> grounded in current web results (with today's date)
    //   otherwise          -> concise general prompt, but still told today's date
    //                         so it stops answering "as of <training year>".
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    let text, provider, model, agentActions = [];
    if (agentMode) {
      // Assistant mode: run the tool-using agent (email, files, web, etc.).
      const me = await get("SELECT name FROM users WHERE id = ?", [req.userId]);
      const result = await runAgent({
        model: resolvedModel,
        history,
        userId: req.userId,
        userName: me?.name,
        today,
      });
      text = result.text;
      provider = result.provider;
      model = result.model;
      agentActions = result.actions || [];
    } else {
      // Choose the system prompt. Never persisted as a chat message.
      //   brain matched      -> grounded in the user's documents
      //   web results found  -> grounded in current web results (with today's date)
      //   otherwise          -> concise general prompt, but still told today's date.
      let systemContent;
      if (usedBrain) {
        systemContent = buildSystemPrompt(usedBrain.name, hits);
      } else if (webResults.length) {
        systemContent = buildWebSearchPrompt(webResults, today);
      } else {
        systemContent = `Today's date is ${today}. ` + DEFAULT_SYSTEM_PROMPT +
          " If a question depends on current facts you can't be sure of (recent events, current officeholders, prices), say what you know and note it may be out of date rather than stating a stale fact as current.";
      }
      const providerMessages = [{ role: "system", content: systemContent }, ...history];
      ({ text, provider, model } = await routeMessage(resolvedModel, providerMessages));
    }

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
        [uuidv4(), req.userId, req.params.id, agentMode ? "agent" : routingMode, embeddingsAvailable() ? 1 : 0, hits.length, isClarification ? 1 : 0, Date.now() - startedAt]
      );
    } catch (e) { console.error("event log failed:", e.message); }

    res.json({
      reply: {
        id: assistantMsgId, role: "assistant", content: text, provider, model,
        brain: usedBrain,                 // which brain answered (or null)
        // Brain sources when grounded in a brain, else the web pages used (if any).
        sources: usedBrain
          ? hits.map((h) => h.title)
          : webResults.map((r) => r.title),
        web: !usedBrain && webResults.length > 0, // answered from live web results
        agent: agentMode,                 // answered via the assistant/agent
        actions: agentActions,            // [{ tool, args }] the agent actually ran
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
