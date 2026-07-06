// Central registry of every model the router can dispatch to.
// Add a new model here + a provider adapter in ./providers, and it
// instantly shows up in the frontend's model selector.
//
// NOTE ON MODEL IDs: provider model IDs change over time. Groq in particular
// retires models fairly often — check https://console.groq.com/docs/models for
// the current list. The two Groq entries below are current production models as
// of mid-2026 (the older llama-3.x IDs were deprecated). Anthropic/OpenAI IDs
// are left as-is; update them to whatever your account has access to.

export const MODEL_REGISTRY = [
  // --- Groq (OpenAI-compatible, generous free tier) ---
  {
    id: "openai/gpt-oss-20b",
    provider: "groq",
    label: "GPT-OSS 20B · Groq (fast)",
    envKey: "GROQ_API_KEY",
  },
  {
    id: "openai/gpt-oss-120b",
    provider: "groq",
    label: "GPT-OSS 120B · Groq",
    envKey: "GROQ_API_KEY",
  },

  // --- Anthropic ---
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    envKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5 (fast)",
    envKey: "ANTHROPIC_API_KEY",
  },

  // --- OpenAI ---
  {
    id: "gpt-4o",
    provider: "openai",
    label: "GPT-4o",
    envKey: "OPENAI_API_KEY",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini (fast)",
    envKey: "OPENAI_API_KEY",
  },
];

// Returns only the models whose provider API key is actually configured,
// so the frontend never offers a model that will just error out.
export function getAvailableModels() {
  return MODEL_REGISTRY.filter((m) => !!process.env[m.envKey]).map((m) => ({
    id: m.id,
    provider: m.provider,
    label: m.label,
  }));
}

export function getModelDefinition(modelId) {
  return MODEL_REGISTRY.find((m) => m.id === modelId);
}
