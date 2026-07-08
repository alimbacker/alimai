import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { get, run } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function requireJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set — add it to your environment variables.");
  }
  return process.env.JWT_SECRET;
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existing = await get("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    await run(
      "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
      [id, name, email, passwordHash]
    );

    const token = jwt.sign({ userId: id }, requireJwtSecret(), { expiresIn: "7d" });
    res.json({ token, user: { id, name, email } });
  } catch (err) {
    console.error("register failed:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await get("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ userId: user.id }, requireJwtSecret(), { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("login failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ---- Google sign-in --------------------------------------------------------
// The frontend uses Google Identity Services to get an ID token (credential);
// we verify it with Google, then find-or-create the user and issue our JWT.
// Set GOOGLE_CLIENT_ID on the server (and VITE_GOOGLE_CLIENT_ID at build time on
// the frontend). Without them, this returns a clear "not configured" message.
async function verifyGoogleIdToken(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw Object.assign(
      new Error("Google sign-in isn't configured on the server (missing GOOGLE_CLIENT_ID)."),
      { status: 501 }
    );
  }
  // tokeninfo validates the signature + expiry on Google's side (no extra deps).
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );
  if (!res.ok) throw Object.assign(new Error("Google sign-in failed: invalid token."), { status: 401 });
  const p = await res.json();
  // The token must have been minted for OUR app, and the email must be verified.
  if (p.aud !== clientId) {
    throw Object.assign(new Error("Google sign-in failed: token audience mismatch."), { status: 401 });
  }
  if (p.email_verified !== true && p.email_verified !== "true") {
    throw Object.assign(new Error("Your Google email address isn't verified."), { status: 401 });
  }
  return {
    sub: p.sub,
    email: p.email,
    name: p.name || (p.email ? p.email.split("@")[0] : "User"),
    picture: p.picture || null,
  };
}

router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body ?? {};
    if (!credential) return res.status(400).json({ error: "Missing Google credential" });

    const g = await verifyGoogleIdToken(credential);

    // Match on Google id first, then on email (so a prior password account with
    // the same email gets linked rather than duplicated).
    let user = await get("SELECT * FROM users WHERE google_id = ? OR email = ?", [g.sub, g.email]);
    if (!user) {
      const id = uuidv4();
      // Google accounts don't use a password; store an unusable hash so the
      // NOT NULL constraint holds and password login stays disabled for them.
      const unusable = await bcrypt.hash(uuidv4() + uuidv4(), 10);
      await run(
        "INSERT INTO users (id, name, email, password_hash, google_id, avatar_url) VALUES (?, ?, ?, ?, ?, ?)",
        [id, g.name, g.email, unusable, g.sub, g.picture]
      );
      user = { id, name: g.name, email: g.email };
    } else if (!user.google_id) {
      await run(
        "UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?",
        [g.sub, g.picture, user.id]
      );
    }

    const token = jwt.sign({ userId: user.id }, requireJwtSecret(), { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("google auth failed:", err);
    res.status(status).json({ error: err.message || "Google sign-in failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await get("SELECT id, name, email, is_admin, status FROM users WHERE id = ?", [req.userId]);
    const { isAdminUser } = await import("../services/admin.js");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: { ...user, is_admin: isAdminUser(user) } });
  } catch (err) {
    console.error("me failed:", err);
    res.status(500).json({ error: "Failed to load user" });
  }
});

export default router;
