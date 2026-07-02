// Central registry of every model the router can dispatch to.
// Add a new model here + a provider adapter in ./providers, and it
// instantly shows up in the frontend's model selector.

export const MODEL_REGISTRY = [
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
