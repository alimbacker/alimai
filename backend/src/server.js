import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import modelsRoutes from "./routes/models.js";
import chatRoutes from "./routes/chat.js";
// Importing db.js here guarantees the schema is created (its top-level migration
// runs on import) before any request is handled — on both local and serverless.
import "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/models", modelsRoutes);
app.use("/api/chat", chatRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Export the app so Vercel can invoke it as a serverless function (see /api/index.js).
// Vercel does NOT run app.listen() — it calls the exported app per request.
export default app;

// Only start a long-running server when run directly in local dev.
// process.env.VERCEL is set automatically on Vercel, so this block is skipped there.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Alim AI backend running on http://localhost:${PORT}`);
  });
}
