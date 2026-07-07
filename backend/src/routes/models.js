import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getAvailableModels } from "../services/modelRegistry.js";
import { getAvailableTiers } from "../services/modelRegistry.js";

const router = Router();

// Kept for back-compat / admin, but the app now uses tiers so model names stay hidden.
router.get("/", requireAuth, (req, res) => {
  res.json({ models: getAvailableModels() });
});

// Effort tiers the UI offers (Low / Medium / High). No model names leak here.
router.get("/tiers", requireAuth, (req, res) => {
  res.json({ tiers: getAvailableTiers() });
});

export default router;
