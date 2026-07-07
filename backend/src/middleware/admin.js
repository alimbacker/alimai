import jwt from "jsonwebtoken";
import { get } from "../db.js";
import { isAdminUser } from "../services/admin.js";

// Like requireAuth, but also loads the user and enforces admin rights.
export async function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    const payload = jwt.verify(header.slice("Bearer ".length), process.env.JWT_SECRET);
    const user = await get("SELECT * FROM users WHERE id = ?", [payload.userId]);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (!isAdminUser(user)) return res.status(403).json({ error: "Admin access required" });
    req.userId = user.id;
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
