import type { ProviderConfig } from "./openaiCompat";

/** Provedor primário. Modelos de raciocínio (GLM) pensam bem menos com "low": ~5 s em vez de ~30 s. */
export const featherless: ProviderConfig = {
  name: "featherless",
  endpoint: "https://api.featherless.ai/v1/chat/completions",
  apiKeyEnv: "FEATHERLESS_API_KEY",
  get concurrency() {
    return Number(process.env.FEATHERLESS_CONCURRENCY) || 2;
  },
  buildExtraBody: (opts) => (opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
};
