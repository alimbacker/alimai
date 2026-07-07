// Adapter for Anthropic's /v1/messages API.
// Unified contract: sendMessage(modelId, messages) -> { text }
// `messages` may include leading { role: 'system', content } entries injected by
// the RAG layer. Anthropic takes `system` as a TOP-LEVEL field (not a message),
// so we split it out here. OpenAI/Groq accept system as a normal message, so
// their adapters don't need this.

export async function sendMessage(modelId, messages) {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
  const turns = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}),
      messages: turns,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return { text };
}
