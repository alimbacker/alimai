import { getModelDefinition } from "./modelRegistry.js";
import * as anthropic from "./providers/anthropic.js";
import * as openai from "./providers/openai.js";

// This is the ONE place that knows how to reach every provider.
// Everything else in the app (routes, frontend) just says
// "send this to model X" and doesn't care how X actually works.
const PROVIDER_ADAPTERS = {
  anthropic,
  openai,
};

export async function routeMessage(modelId, messages) {
  const modelDef = getModelDefinition(modelId);
  if (!modelDef) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  const apiKey = process.env[modelDef.envKey];
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${modelDef.label}. Add ${modelDef.envKey} to your .env file.`
    );
  }

  const adapter = PROVIDER_ADAPTERS[modelDef.provider];
  if (!adapter) {
    throw new Error(`No adapter implemented for provider: ${modelDef.provider}`);
  }

  const { text } = await adapter.sendMessage(modelId, messages);
  return { text, provider: modelDef.provider, model: modelId };
}
