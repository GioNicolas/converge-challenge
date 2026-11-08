// Sessões do Live Coding entre instâncias (Vercel). A memória continua sendo a fonte da verdade dentro de uma
// requisição: a sessão é restaurada do Supabase se a instância não a conhece (ou conhece uma versão mais velha)
// e gravada de volta ao fim da requisição, juntando os eventos que outra instância tenha gravado nesse meio-tempo.
// Sem Supabase (testes, dev) nada disso faz nada. Falha de rede nunca derruba a entrevista.
import type { SessionState } from "@/lib/session/types";
import { getSession, substituirSessao } from "@/lib/session/store";
import { kvRemoto } from "@/lib/storage/kv";

const NS = "sessoes-live";
/** Reivindicação de avaliação: depois disso a avaliação "em andamento" de outra instância é dada como perdida. */
export const AVALIACAO_PERDIDA_MS = 150_000;

/** A sessão pelo id: da memória, ou restaurada do Supabase quando esta instância não a viu (ou está atrasada). */
export async function sessaoViva(sessionId: string): Promise<SessionState | undefined> {
  const local = getSession(sessionId);
  const kv = kvRemoto();
  if (!kv) return local;
  try {
    const remota = await kv.get<SessionState>(NS, sessionId);
    if (!remota) return local;
    if (!local) {
      substituirSessao(remota);
      return getSession(sessionId);
    }
    // Remota mais nova (outra instância tratou eventos que esta não viu): adota, mantendo o objeto local.
    if (remota.events.length > local.events.length || (remota.ended && !local.ended)) {
      substituirSessao(remota, local);
    }
    return local;
  } catch (err) {
    console.error("[sessao] não restaurou do Supabase:", err instanceof Error ? err.message : "erro");
    return local;
  }
}

const chaveEvento = (e: unknown) => JSON.stringify(e);

/** Grava a sessão, unindo eventos e versões de código que a cópia remota tenha e esta não. */
export async function guardarSessao(session: SessionState): Promise<void> {
  const kv = kvRemoto();
  if (!kv) return;
  try {
    const remota = await kv.get<SessionState>(NS, session.sessionId);
    if (remota) {
      const vistos = new Set(session.events.map(chaveEvento));
      const novos = remota.events.filter((e) => !vistos.has(chaveEvento(e)));
      if (novos.length) session.events = [...session.events, ...novos].sort((a, b) => a.t - b.t);
      const versoes = new Set(session.codeHistory.map((c) => `${c.version}|${c.t}`));
      const codigos = remota.codeHistory.filter((c) => !versoes.has(`${c.version}|${c.t}`));
      if (codigos.length) session.codeHistory = [...session.codeHistory, ...codigos].sort((a, b) => a.t - b.t);
      if (remota.ended) session.ended = true;
      if (!session.report && remota.report) session.report = remota.report;
    }
    await kv.set(NS, session.sessionId, session);
  } catch (err) {
    console.error("[sessao] não gravou no Supabase:", err instanceof Error ? err.message : "erro");
  }
}
