import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getAvailableModels } from "../services/modelRegistry.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.json({ models: getAvailableModels() });
});

export default router;
