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
    // Gemini: Google AI Studio primeiro. Com o prompt em cache (cache_control), o OpenRouter mandava para o Vertex,
    // ~0,4 s mais lento por fala; no AI Studio o cache vale igual (medido em 2026-11-09: p50 1,5 s, -80% no custo).
    provider: {
      sort: opts.priorizarLatencia ? "latency" : "throughput",
      ...(opts.model?.startsWith("google/gemini") ? { order: ["google-ai-studio"], allow_fallbacks: true } : {}),
    },
    usage: { include: true },
    ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
  }),
};
