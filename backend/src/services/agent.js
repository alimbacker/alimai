// The "assistant" brain. Runs a small ReAct-style loop on top of the existing
// routeMessage() so it works with ANY provider (Groq/OpenAI/Anthropic) without
// needing each one's native function-calling API: the model emits a JSON action,
// we run the tool, feed back an observation, and repeat until it answers.
import { routeMessage } from "./modelRouter.js";
import { toolCatalog, runTool, TOOLS } from "./tools.js";

const MAX_STEPS = 5;

export function agentSystemPrompt(today, userName) {
  const who = userName ? `${userName}'s ` : "a ";
  return (
    `You are Alim, ${who}personal AI assistant in the spirit of a capable movie AI (think JARVIS): confident, concise, proactive, lightly witty, and action-oriented. Today is ${today}.\n\n` +
    `You can take REAL actions with tools. When you want to use a tool, reply with ONLY a single JSON object and nothing else:\n` +
    `{"action": "<tool_name>", "args": { ... }}\n\n` +
    `Tools:\n${toolCatalog()}\n\n` +
    `RULES:\n` +
    `- If the user asks you to DO something (send, delete, look up, list), use the right tool.\n` +
    `- Before any DESTRUCTIVE/irreversible action (send_email, delete_file), FIRST reply in plain words stating exactly what you'll do and ask them to confirm. Only after they say yes should you emit the tool JSON.\n` +
    `- To act on a stored item ("delete the beach photo"), call list_files first to get its id, then delete_file.\n` +
    `- If you're missing something (like the recipient's email), ask for it in plain words.\n` +
    `- When just chatting or answering a question that needs no tool, reply normally in plain prose — do NOT emit JSON then.\n` +
    `- After a tool runs you'll receive an OBSERVATION. Give a short, natural confirmation of what happened.\n` +
    `- Keep replies short and easy to read aloud. No markdown tables or code fences.\n` +
    `- You act on EMAIL and files stored in Alim. You cannot control the user's phone, camera roll, SMS, or WhatsApp; if asked for that, say so briefly and offer what you can do.`
  );
}

// Try to pull a {"action": ...} object out of a model reply. Tolerates code
// fences and surrounding prose. Returns the object or null (=> plain answer).
function parseAction(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const tryParse = (s) => { try { const o = JSON.parse(s); return o && typeof o === "object" ? o : null; } catch { return null; } };
  let obj = tryParse(t);
  if (!obj) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) obj = tryParse(t.slice(start, end + 1));
  }
  if (obj && typeof obj.action === "string" && TOOLS.some((tool) => tool.name === obj.action)) {
    return obj;
  }
  return null;
}

export async function runAgent({ model, history, userId, userName, today }) {
  const messages = [{ role: "system", content: agentSystemPrompt(today, userName) }, ...history];
  const actions = [];
  let last = { text: "", provider: null, model: null };

  for (let step = 0; step < MAX_STEPS; step++) {
    last = await routeMessage(model, messages);
    const action = parseAction(last.text);
    if (!action) {
      return { text: (last.text || "").trim(), provider: last.provider, model: last.model, actions };
    }
    const observation = await runTool(action.action, action.args || {}, { userId });
    actions.push({ tool: action.action, args: action.args || {} });
    messages.push({ role: "assistant", content: last.text });
    messages.push({ role: "user", content: `OBSERVATION (${action.action}): ${observation}` });
  }

  // Safety valve: too many tool steps — ask for a plain wrap-up.
  const wrap = await routeMessage(model, [
    ...messages,
    { role: "user", content: "Give the user a one-sentence summary now. Do not use a tool." },
  ]);
  return { text: (wrap.text || "").trim(), provider: wrap.provider, model: wrap.model, actions };
}
