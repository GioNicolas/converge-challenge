/**
 * Política determinística do agente: escolhe quando um blip aparece e qual dica está disponível.
 * O conteúdo das perguntas vem do Analyst (lib/agents/analyst.ts).
 */
import type { Blip, SessionEvent } from "@/lib/contracts";
import type { QueuedQuestion, SessionState } from "@/lib/session/types";
import { getProblem } from "@/problems";

export function findBlipQuestion(
  session: SessionState,
  blipId: string,
): { blip: Blip; question: QueuedQuestion } | undefined {
  const blip = session.blips.find((b) => b.id === blipId);
  const question = session.queue.find((q) => q.id === blipId);
  return blip && question ? { blip, question } : undefined;
}

/** Próxima dica leve do problema, ou undefined quando as dicas acabaram. */
export function nextHint(session: SessionState): string | undefined {
  return getProblem(session.config.problemId).private.hints[session.hintsUsed];
}

/** Tipos que deixam o candidato parado: ele não está digitando nem rodando nada agora. */
const IDLE_EVENT_TYPES = new Set<SessionEvent["type"]>(["pause", "run", "blip_closed", "session_started"]);
/** Depois desse tempo sem evento novo, o candidato também conta como parado. */
const IDLE_AFTER_MS = 8000;

/** Candidato parado em t (ms de sessão): só o polling de blips (GET /api/blip/pending) usa isso. */
export function isCandidateIdle(session: SessionState, t: number): boolean {
  const last = session.events.at(-1);
  if (last === undefined) return true;
  return IDLE_EVENT_TYPES.has(last.type) || t - last.t > IDLE_AFTER_MS;
}

/** Decide se a fila vira um blip agora (t em ms de sessão). Não aparece com outro blip pendente. */
export function decideBlip(session: SessionState, t: number): Blip | undefined {
  if (session.pendingBlipId) return undefined;

  const candidate = session.queue
    .filter((q) => q.status === "queued" && q.priority >= 0.6)
    .reduce<QueuedQuestion | undefined>((best, q) => (!best || q.priority > best.priority ? q : best), undefined);
  if (!candidate) return undefined;

  const lastBlip = session.blips.at(-1);
  const cooldownOver = !lastBlip || t - lastBlip.createdAt >= 60000;
  if (!cooldownOver && candidate.priority < 0.9) return undefined;

  candidate.status = "blipped";
  const blip: Blip = {
    id: candidate.id,
    preview: "Tenho uma pergunta sobre seu código",
    priority: candidate.priority,
    createdAt: t,
    highlight: candidate.highlight,
  };
  session.blips.push(blip);
  session.pendingBlipId = blip.id;
  return blip;
}
