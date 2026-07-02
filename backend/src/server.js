import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import modelsRoutes from "./routes/models.js";
import chatRoutes from "./routes/chat.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/models", modelsRoutes);
app.use("/api/chat", chatRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Alim AI backend running on http://localhost:${PORT}`);
});
