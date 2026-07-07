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
