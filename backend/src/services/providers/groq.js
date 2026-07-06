// Adapter for Groq's OpenAI-compatible Chat Completions API.
// Same unified contract as the other providers: sendMessage(modelId, messages) -> { text }
// Groq mirrors the OpenAI request/response shape, so this is nearly identical to openai.js —
// just a different base URL and API key.

export async function sendMessage(modelId, messages) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  return { text };
}
