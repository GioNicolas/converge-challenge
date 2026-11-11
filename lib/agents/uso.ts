import type { SessionState } from "@/lib/session/types";
import { appendEvent, sessionNow } from "@/lib/session/store";

export function registrarUsoLlm(session: SessionState, papel: "fala" | "filtro" | "analise" | "relatorio", r: {
  model: string; provider: string; durationMs: number; reservaDisparada?: boolean;
  promptTokens: number; completionTokens: number; cachedTokens?: number; costUsd: number;
}): void {
  appendEvent(session, { type: "llm_uso", sessionId: session.sessionId, t: sessionNow(session), papel, modelo: r.model, provedor: r.provider,
    reserva_disparada: r.reservaDisparada ?? false, ms: r.durationMs, tokens_entrada: r.promptTokens,
    tokens_saida: r.completionTokens, ...(r.cachedTokens !== undefined ? { tokens_cache: r.cachedTokens } : {}), custo_usd: r.costUsd });
}
