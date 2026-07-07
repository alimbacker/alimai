import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { get, all, run } from "../db.js";
import { requireAdmin } from "../middleware/admin.js";
import { isAdminUser, adminEmailSet } from "../services/admin.js";

const router = Router();
router.use(requireAdmin);

const one = async (sql, args = []) => (await get(sql, args))?.n ?? 0;

// Fill a continuous N-day series (oldest -> newest) from {date -> count} rows.
function series(rows, days = 7) {
  const map = new Map(rows.map((r) => [r.d, Number(r.n)]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ date: d, value: map.get(d) || 0 });
  }
  return out;
}

// ---- Top stat cards ----------------------------------------------------------
router.get("/stats", async (req, res) => {
  try {
    const [users, active, newToday, conversations, messages, documents, chunks, brains] =
      await Promise.all([
        one("SELECT COUNT(*) n FROM users"),
        one("SELECT COUNT(DISTINCT user_id) n FROM conversations WHERE created_at >= datetime('now','-30 days')"),
        one("SELECT COUNT(*) n FROM users WHERE date(created_at) = date('now')"),
        one("SELECT COUNT(*) n FROM conversations"),
        one("SELECT COUNT(*) n FROM messages"),
        one("SELECT COUNT(*) n FROM documents"),
        one("SELECT COUNT(*) n FROM chunks"),
        one("SELECT COUNT(*) n FROM brains"),
      ]);
    // admins = flagged users + bootstrap emails present in the users table
    const flagged = await one("SELECT COUNT(*) n FROM users WHERE is_admin = 1");
    const emailSet = adminEmailSet();
    let bootstrapExtra = 0;
    if (emailSet.size) {
      const rows = await all("SELECT email, is_admin FROM users");
      bootstrapExtra = rows.filter((r) => r.is_admin !== 1 && emailSet.has((r.email || "").toLowerCase())).length;
    }
    res.json({
      stats: { users, active, newToday, conversations, messages, documents, chunks, brains, admins: flagged + bootstrapExtra },
    });
  } catch (err) {
    console.error("stats failed:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ---- Charts + retrieval analytics -------------------------------------------
router.get("/analytics", async (req, res) => {
  try {
    const signupRows = await all(
      "SELECT date(created_at) d, COUNT(*) n FROM users WHERE created_at >= datetime('now','-7 days') GROUP BY d"
    );
    const messageRows = await all(
      "SELECT date(created_at) d, COUNT(*) n FROM messages WHERE created_at >= datetime('now','-7 days') GROUP BY d"
    );

    // Retrieval analytics over last 30 days from retrieval_events.
    const ev = await get(`
      SELECT
        COUNT(*) turns,
        SUM(CASE WHEN semantic = 1 AND hit_count > 0 THEN 1 ELSE 0 END) semantic_hits,
        SUM(CASE WHEN semantic = 0 AND hit_count > 0 THEN 1 ELSE 0 END) keyword_fallback,
        SUM(CASE WHEN hit_count = 0 AND mode != 'none' THEN 1 ELSE 0 END) zero_result,
        SUM(clarification) clarifications,
        SUM(error) errors,
        AVG(latency_ms) avg_latency
      FROM retrieval_events WHERE created_at >= datetime('now','-30 days')`);

    const fb = await get(`
      SELECT
        SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) up,
        SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) down
      FROM message_feedback`);

    const latencyRows = await all(
      "SELECT date(created_at) d, CAST(AVG(latency_ms) AS INTEGER) n FROM retrieval_events WHERE created_at >= datetime('now','-7 days') GROUP BY d"
    );
    const clarifRows = await all(
      "SELECT date(created_at) d, SUM(clarification) n FROM retrieval_events WHERE created_at >= datetime('now','-7 days') GROUP BY d"
    );

    const up = Number(fb?.up || 0), down = Number(fb?.down || 0);
    res.json({
      dailySignups: series(signupRows),
      dailyMessages: series(messageRows),
      retrieval: {
        turns: Number(ev?.turns || 0),
        semanticHits: Number(ev?.semantic_hits || 0),
        keywordFallback: Number(ev?.keyword_fallback || 0),
        zeroResult: Number(ev?.zero_result || 0),
        clarifications: Number(ev?.clarifications || 0),
        errors: Number(ev?.errors || 0),
        avgLatency: Math.round(Number(ev?.avg_latency || 0)),
        up, down,
        helpfulPct: up + down > 0 ? Math.round((up / (up + down)) * 100) : null,
      },
      latencyTrend: series(latencyRows),
      clarificationTrend: series(clarifRows),
    });
  } catch (err) {
    console.error("analytics failed:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ---- Users management --------------------------------------------------------
router.get("/users", async (req, res) => {
  try {
    const q = (req.query.search || "").toString().trim();
    let rows;
    if (q) {
      const like = `%${q}%`;
      rows = await all(
        `SELECT id, name, email, status, is_admin, created_at, last_login
           FROM users WHERE email LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 200`,
        [like, like]
      );
    } else {
      rows = await all(
        `SELECT id, name, email, status, is_admin, created_at, last_login
           FROM users ORDER BY created_at DESC LIMIT 200`
      );
    }
    res.json({ users: rows });
  } catch (err) {
    console.error("list users failed:", err);
    res.status(500).json({ error: "Failed to load users" });
  }
});

// Change status: active | suspended | disabled | terminated
router.post("/users/:id/status", async (req, res) => {
  try {
    const { status } = req.body ?? {};
    const allowed = ["active", "suspended", "disabled", "terminated"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
    if (req.params.id === req.userId && status !== "active") {
      return res.status(400).json({ error: "You can't change your own status" });
    }
    await run("UPDATE users SET status = ? WHERE id = ?", [status, req.params.id]);
    res.json({ ok: true, status });
  } catch (err) {
    console.error("status change failed:", err);
    res.status(500).json({ error: "Failed to change status" });
  }
});

// Reset a user's password to a generated one (returned once for the admin to share).
router.post("/users/:id/reset-password", async (req, res) => {
  try {
    const temp = "Al-" + Math.random().toString(36).slice(2, 10);
    const hash = await bcrypt.hash(temp, 10);
    await run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id]);
    res.json({ ok: true, tempPassword: temp });
  } catch (err) {
    console.error("reset pw failed:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// Delete a user and everything they own.
router.delete("/users/:id", async (req, res) => {
  try {
    if (req.params.id === req.userId) return res.status(400).json({ error: "You can't delete yourself" });
    const brains = await all("SELECT id FROM brains WHERE user_id = ?", [req.params.id]);
    for (const b of brains) {
      await run("DELETE FROM chunks WHERE brain_id = ?", [b.id]);
      await run("DELETE FROM documents WHERE brain_id = ?", [b.id]);
    }
    await run("DELETE FROM brains WHERE user_id = ?", [req.params.id]);
    const convos = await all("SELECT id FROM conversations WHERE user_id = ?", [req.params.id]);
    for (const c of convos) await run("DELETE FROM messages WHERE conversation_id = ?", [c.id]);
    await run("DELETE FROM conversations WHERE user_id = ?", [req.params.id]);
    await run("DELETE FROM retrieval_events WHERE user_id = ?", [req.params.id]);
    await run("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("delete user failed:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ---- Admins ------------------------------------------------------------------
router.get("/admins", async (req, res) => {
  try {
    const emailSet = adminEmailSet();
    const rows = await all("SELECT id, name, email, is_admin, created_at, last_login FROM users");
    const admins = rows
      .filter((u) => u.is_admin === 1 || emailSet.has((u.email || "").toLowerCase()))
      .map((u) => ({ ...u, bootstrap: u.is_admin !== 1 && emailSet.has((u.email || "").toLowerCase()) }));
    res.json({ admins });
  } catch (err) {
    console.error("list admins failed:", err);
    res.status(500).json({ error: "Failed to load admins" });
  }
});

// Create (or promote) an admin. Field can be an email or a bare username.
router.post("/admins", async (req, res) => {
  try {
    let { email, password, name } = req.body ?? {};
    if (!email?.trim() || !password) return res.status(400).json({ error: "email/username and password required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    email = email.trim();
    const emailNorm = email.includes("@") ? email.toLowerCase() : `${email.toLowerCase()}@admin.local`;

    const existing = await get("SELECT id FROM users WHERE email = ?", [emailNorm]);
    if (existing) {
      await run("UPDATE users SET is_admin = 1 WHERE id = ?", [existing.id]);
      return res.json({ ok: true, promoted: true, id: existing.id });
    }
    const id = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    await run(
      "INSERT INTO users (id, name, email, password_hash, is_admin, status) VALUES (?, ?, ?, ?, 1, 'active')",
      [id, name?.trim() || email, emailNorm, hash]
    );
    res.json({ ok: true, created: true, id, email: emailNorm });
  } catch (err) {
    console.error("create admin failed:", err);
    res.status(500).json({ error: "Failed to create admin" });
  }
});

// Revoke admin (demote). Bootstrap admins (via ADMIN_EMAILS) can't be demoted here.
router.delete("/admins/:id", async (req, res) => {
  try {
    if (req.params.id === req.userId) return res.status(400).json({ error: "You can't remove yourself" });
    await run("UPDATE users SET is_admin = 0 WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("demote failed:", err);
    res.status(500).json({ error: "Failed to update admin" });
  }
});

export default router;
