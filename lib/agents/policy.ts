/**
 * Política determinística do agente (stub). Substituída pelo Analyst com LLM.
 * Sem efeitos colaterais além de mutar a sessão recebida.
 */
import type { Blip, SessionEvent } from "@/lib/contracts";
import type { QueuedQuestion, SessionState } from "@/lib/session/types";
import { latestCode } from "@/lib/session/store";

export const PASTE_QUESTION = "Me explica o que esse trecho que você colou faz.";
export const AVAILABLE_HINT =
  "Tem alguma estrutura de dados que te deixa checar se um número já apareceu sem percorrer a lista toda?";

const ROTATION: ReadonlyArray<{ question: string; followUpTopic: string }> = [
  { question: "Por que você escolheu esse caminho?", followUpTopic: "a escolha da abordagem" },
  { question: "Me explica o que esse trecho faz.", followUpTopic: "o funcionamento do trecho grifado" },
  {
    question: "Como você acha que esse código se comporta com entradas muito grandes?",
    followUpTopic: "por que ficaria pesado e se dá pra otimizar",
  },
  {
    question: "E quando não tiver entrada nenhuma? Por que ele vai funcionar?",
    followUpTopic: "o comportamento com entrada vazia",
  },
];

/** Último código já analisado, por sessão. Só dispara análise nova se o código mudou. */
const lastAnalyzedCode = new WeakMap<SessionState, string>();

export function findBlipQuestion(
  session: SessionState,
  blipId: string,
): { blip: Blip; question: QueuedQuestion } | undefined {
  const blip = session.blips.find((b) => b.id === blipId);
  const question = session.queue.find((q) => q.id === blipId);
  return blip && question ? { blip, question } : undefined;
}

export function stubAnalyze(session: SessionState, trigger: SessionEvent): void {
  session.analyst.lastTrigger = trigger.type;
  session.analyst.lastRunAt = trigger.t;
  session.analyst.runs += 1;

  const code = latestCode(session);
  if (code.trim() === "" || lastAnalyzedCode.get(session) === code) return;
  lastAnalyzedCode.set(session, code);

  if (trigger.type === "paste" && trigger.lines >= 5) {
    enqueue(session, {
      question: PASTE_QUESTION,
      followUpTopic: "o trecho que você colou",
      priority: 0.95,
      highlight: { startLine: trigger.startLine, endLine: trigger.startLine + trigger.lines - 1 },
    });
    return;
  }

  const used = new Set(session.queue.map((q) => q.question));
  const next = ROTATION.find((r) => !used.has(r.question));
  if (!next) return;

  const lineCount = code.split("\n").length;
  enqueue(session, {
    question: next.question,
    followUpTopic: next.followUpTopic,
    priority: 0.7,
    highlight: { startLine: 1, endLine: Math.min(lineCount, 5) },
  });
}

type NewQuestion = Pick<QueuedQuestion, "question" | "followUpTopic" | "priority" | "highlight">;

function enqueue(session: SessionState, question: NewQuestion): void {
  session.queue.push({
    ...question,
    id: `q-${session.queue.length + 1}`,
    createdAt: session.events.at(-1)?.t ?? 0,
    status: "queued",
  });
}

export function decideBlip(session: SessionState, event: SessionEvent): Blip | undefined {
  if (session.pendingBlipId) return undefined;

  const candidate = session.queue
    .filter((q) => q.status === "queued" && q.priority >= 0.6)
    .reduce<QueuedQuestion | undefined>((best, q) => (!best || q.priority > best.priority ? q : best), undefined);
  if (!candidate) return undefined;

  const lastBlip = session.blips.at(-1);
  const cooldownOver = !lastBlip || event.t - lastBlip.createdAt >= 60000;
  if (!cooldownOver && candidate.priority < 0.9) return undefined;

  candidate.status = "blipped";
  const blip: Blip = {
    id: candidate.id,
    preview:
      candidate.question === PASTE_QUESTION
        ? "Quero entender o trecho que você colou"
        : "Tenho uma pergunta sobre seu código",
    priority: candidate.priority,
    createdAt: event.t,
    highlight: candidate.highlight,
  };
  session.blips.push(blip);
  session.pendingBlipId = blip.id;
  return blip;
}
