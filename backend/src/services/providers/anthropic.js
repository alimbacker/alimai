// Adapter for Anthropic's /v1/messages API.
// Unified contract: sendMessage(modelId, messages) -> { text }
// `messages` is [{ role: 'user'|'assistant', content: string }]

export async function sendMessage(modelId, messages) {
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
      messages,
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
