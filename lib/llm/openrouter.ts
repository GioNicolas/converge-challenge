import type { ProviderConfig } from "./openaiCompat";

/** Reserva: entra quando a Featherless falha ou demora demais. */
export const openrouter: ProviderConfig = {
  name: "openrouter",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  apiKeyEnv: "OPENROUTER_API_KEY",
  get concurrency() {
    return Number(process.env.OPENROUTER_CONCURRENCY) || 4;
  },
  buildExtraBody: (opts) => ({
    // Falas curtas priorizam o início da resposta; relatórios priorizam tokens por segundo.
    provider: { sort: opts.priorizarLatencia ? "latency" : "throughput" },
    usage: { include: true },
    ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
  }),
};
