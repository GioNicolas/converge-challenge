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

/**
 * Chave de um evento para unir as cópias, com as chaves dos objetos em ordem. O Supabase (jsonb) devolve as
 * chaves reordenadas: com JSON.stringify puro o mesmo evento parecia outro e entrava em dobro na linha do tempo.
 */
export function chaveEvento(e: unknown): string {
  return JSON.stringify(e, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Quanto uma pergunta já andou: entre duas cópias, vale a que andou mais (nunca volta para a fila). */
const ANDAMENTO: Record<SessionState["queue"][number]["status"], number> = { queued: 0, blipped: 1, stale: 2, ignored: 2, asked: 3 };

/**
 * Une as perguntas, os balões, os retornos e as evidências das duas cópias. Sem isso, uma instância que não viu a
 * pergunta levantada por outra gravava por cima e a pergunta sumia: a conversa dela dava 404 e o Totti pedia
 * para repetir a cada fala do candidato.
 */
function juntarPerguntas(session: SessionState, remota: SessionState): void {
  const fila = new Map(session.queue.map((q) => [q.id, q]));
  for (const q of remota.queue) {
    const local = fila.get(q.id);
    if (!local) session.queue.push(q);
    else if (ANDAMENTO[q.status] > ANDAMENTO[local.status]) Object.assign(local, q);
  }
  const balões = new Set(session.blips.map((b) => b.id));
  const novos = remota.blips.filter((b) => !balões.has(b.id));
  if (novos.length) session.blips = [...session.blips, ...novos].sort((a, b) => a.createdAt - b.createdAt);
  const retornos = new Set(session.checkIns.map((c) => c.id));
  session.checkIns.push(...remota.checkIns.filter((c) => !retornos.has(c.id)));
  const vistas = new Set(session.evidence.map(chaveEvento));
  const evidencias = remota.evidence.filter((e) => !vistas.has(chaveEvento(e)));
  if (evidencias.length) session.evidence = [...session.evidence, ...evidencias].sort((a, b) => a.t - b.t);
  if (!session.empecilho && remota.empecilho) session.empecilho = remota.empecilho;
  // Balão pendente da outra cópia continua pendente, a não ser que a linha do tempo já o tenha fechado.
  const pendente = session.pendingBlipId ?? remota.pendingBlipId;
  const fechado = pendente !== undefined && session.events.some((e) => (e.type === "blip_closed" || e.type === "blip_snoozed") && e.blipId === pendente);
  session.pendingBlipId = fechado ? undefined : pendente;
}

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
      juntarPerguntas(session, remota);
    }
    await kv.set(NS, session.sessionId, session);
  } catch (err) {
    console.error("[sessao] não gravou no Supabase:", err instanceof Error ? err.message : "erro");
  }
}
