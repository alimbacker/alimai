// Vercel serverless entrypoint.
// Vercel invokes the exported Express app as a (req, res) handler for every
// request routed here by vercel.json ("/api/(.*)" -> "/api/index.js").
// The app itself mounts routes under /api/..., and the original request path is
// preserved, so /api/auth/login etc. match correctly.
import app from "../backend/src/server.js";

export default app;
