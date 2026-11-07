/**
 * Política determinística do agente: escolhe quando um blip aparece e qual dica está disponível.
 * O conteúdo das perguntas vem do Analyst (lib/agents/analyst.ts), menos a pergunta de abertura.
 */
import { isCovered } from "@/lib/agents/coverage";
import { faseDaEntrevista, linesWrittenBeyondStarter } from "@/lib/agents/fase";
import type { Blip, RunResult, SessionEvent } from "@/lib/contracts";
import type { QueuedQuestion, SessionState } from "@/lib/session/types";
import { getProblem } from "@/problems";

// Afinação do ritmo dos blips. Tempos em ms de sessão.

/** Pergunta fixa de abertura. É leve: uma pergunta, sem aprofundar (o Interviewer sabe que é abertura). */
const KICKOFF_QUESTION = "Quando quiser, me conta rapidinho como você está pensando em resolver?";
/** Tema da abertura (o Interviewer não aprofunda a abertura, mas o campo é obrigatório). */
const KICKOFF_FOLLOW_UP = "a ideia geral dele";
/** Rótulo do balão da abertura. */
const KICKOFF_TOPIC_LABEL = "seu plano de ataque";
/** Prioridade da abertura (alta, mas ela tem regras próprias). */
const KICKOFF_PRIORITY = 0.95;
/** Tempo pra ler o enunciado antes de a abertura aparecer. */
const KICKOFF_READING_MS = 40_000;
/** Se o candidato já escreveu esse tanto de linhas além do código inicial, ele escolheu codar primeiro: a abertura é descartada. */
const KICKOFF_SKIP_IF_LINES_WRITTEN = 3;
/** Prioridade mínima, já com o boost de momento, pra uma pergunta virar blip. */
const BLIP_THRESHOLD = 0.6;
/** Perguntas com prioridade a partir daqui pulam a regra de 60 s entre blips (não as outras). */
const HIGH_PRIORITY = 0.9;
/** Balão nunca aberto some sozinho depois desse tempo (a pergunta vira "ignorada"). */
const BLIP_EXPIRY_MS = 80_000;
/** Nenhum blip do Analyst nos primeiros 45 s da sessão. */
const WARMUP_MS = 45_000;
/** Intervalo mínimo entre o createdAt do último blip e o próximo. */
const MIN_GAP_BETWEEN_BLIPS_MS = 60_000;
/** Intervalo mínimo depois que a última conversa terminou (vale pra toda pergunta). */
const MIN_GAP_AFTER_CONVERSATION_MS = 30_000;
/** Máximo de blips do Analyst por sessão (a abertura não conta). */
const MAX_ANALYST_BLIPS = 8;
/** Preferência da pergunta de foco da vaga na fila, para ela não ficar sempre atrás das perguntas sobre o código. */
const FOCUS_QUESTION_BONUS = 0.1;
/** Boost pro primeiro run com todos os casos passando: bom momento pra pergunta de complexidade. */
const BOOST_FIRST_GREEN_RUN = 0.15;
/** Boost pra um run que falhou: o candidato pode estar travado. */
const BOOST_FAILED_RUN = 0.1;
/** Boost pra uma pausa longa: o candidato parou de digitar por um tempo. */
const BOOST_LONG_PAUSE = 0.1;
/** Pausa a partir desse tamanho conta como pausa longa pro boost. */
const LONG_PAUSE_MS = 30_000;
/** A partir dessa fração do tempo, pergunta de critério ainda não explorado ganha reforço. */
const AGENDA_START_FRACTION = 0.4;
/** Reforço de agenda: critério da recrutadora que ainda não foi explorado. */
const BOOST_UNCOVERED = 0.15;
/** Na reta final, pergunta de critério não explorado pula o intervalo entre blips e o limite de blips. */
const FINAL_STRETCH_MS = 8 * 60_000;
/** Retorno de desafio: depois desse tempo volta mesmo sem o código mudar. */
const CHECK_IN_MAX_WAIT_MS = 4 * 60_000;
/** Retorno de desafio: com o código mudado, volta depois desse tempo sem digitar. */
const CHECK_IN_IDLE_MS = 30_000;
/** Retorno de desafio: volta de qualquer jeito quando faltar esse tempo. */
const CHECK_IN_BEFORE_END_MS = 5 * 60_000;
/** Pergunta ignorada de critério não explorado volta depois desse tempo (uma vez). */
const IGNORED_RETRY_MS = 120_000;
/** Tipos que deixam o candidato parado: ele não está digitando nem rodando nada agora. */
const IDLE_EVENT_TYPES = new Set<SessionEvent["type"]>(["pause", "run", "blip_closed", "session_started"]);
/** Depois desse tempo sem evento novo, o candidato também conta como parado. */
const IDLE_AFTER_MS = 8000;
/** Escrevendo a primeira versão, só interrompe quem parou de mexer no código há esse tempo (provável travada). */
const IMPLEMENTING_IDLE_MS = 20_000;
/** Mexendo para melhorar uma solução que já funciona: só interrompe depois desse tempo sem mexer. */
const OPTIMIZING_IDLE_MS = 45_000;
/** Pergunta que não virou balão nesse tempo fica velha: o candidato já está pensando em outra coisa. */
const QUESTION_MAX_AGE_MS = 90_000;

const NO_BOOST = { boost: 0, reason: "" };

// Em globalThis, como o store e o Analyst: o Next em dev recarrega o módulo e zeraria o WeakMap.
const globalWithDecisions = globalThis as typeof globalThis & {
  __blipDecisions?: WeakMap<SessionState, string>;
};
const decisions = (globalWithDecisions.__blipDecisions ??= new WeakMap<SessionState, string>());

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

/** Candidato parado em t (ms de sessão): quem decide o blip (decideBlip) usa isso. */
export function isCandidateIdle(session: SessionState, t: number): boolean {
  const last = session.events.at(-1);
  if (last === undefined) return true;
  return IDLE_EVENT_TYPES.has(last.type) || t - last.t > IDLE_AFTER_MS;
}

/** Enfileira a pergunta de abertura quando a sessão começa. Uma por sessão (reconexão não duplica). */
export function enqueueKickoff(session: SessionState, t: number): void {
  if (session.queue.some((q) => q.kickoff)) return;
  session.queue.push({
    id: `q-${session.queue.length + 1}`,
    question: KICKOFF_QUESTION,
    followUpTopic: KICKOFF_FOLLOW_UP,
    topicLabel: KICKOFF_TOPIC_LABEL,
    priority: KICKOFF_PRIORITY,
    createdAt: t,
    status: "queued",
    kickoff: true,
  });
}

/** Ótimo momento pra blip, pelo último run ou pausa da sessão. Sem evento relevante, sem boost. */
export function momentBoost(session: SessionState): { boost: number; reason: string } {
  const last = session.events.filter((e) => e.type === "run" || e.type === "pause").at(-1);
  if (last === undefined) return NO_BOOST;

  if (last.type === "pause") {
    return last.idleMs >= LONG_PAUSE_MS ? { boost: BOOST_LONG_PAUSE, reason: "pausa longa" } : NO_BOOST;
  }
  if (!allPassed(last.result)) return { boost: BOOST_FAILED_RUN, reason: "run com falha" };

  const firstGreen = session.events.findIndex((e) => e.type === "run" && allPassed(e.result));
  return firstGreen === session.events.indexOf(last)
    ? { boost: BOOST_FIRST_GREEN_RUN, reason: "primeiro run verde" }
    : NO_BOOST;
}

/** Motivo da última decisão de blip (pro painel de debug). Atualizado a cada decideBlip. */
export function lastBlipDecision(session: SessionState): string | undefined {
  return decisions.get(session);
}

/**
 * Decide se a fila vira um blip agora (t em ms de sessão). Só levanta blip com o candidato parado
 * e sem outro blip pendente. Efeito colateral: marca a pergunta como blipped, stale ou ignored.
 * `dismissBlipId`: o balão anterior expirou nesta chamada e a IDE deve tirá-lo da tela.
 */
export function decideBlip(session: SessionState, t: number): { blip?: Blip; dismissBlipId?: string } {
  const dismissBlipId = expireBlip(session, t);
  const { blip, reason } = pickBlip(session, t);
  decisions.set(session, dismissBlipId ? `balão ${dismissBlipId.slice(0, 8)} expirou · ${reason}` : reason);
  return { blip, dismissBlipId };
}

/** Balão aberto e nunca clicado há BLIP_EXPIRY_MS vira ignorado. Devolve o id que sai da tela, se houver. */
function expireBlip(session: SessionState, t: number): string | undefined {
  const pendingId = session.pendingBlipId;
  if (pendingId === undefined) return undefined;
  const found = findBlipQuestion(session, pendingId);
  if (!found || found.question.status !== "blipped") return undefined;
  if (t - found.blip.createdAt < BLIP_EXPIRY_MS) return undefined;

  found.question.status = "ignored";
  session.pendingBlipId = undefined;
  // Critério da agenda ainda não explorado: a pergunta volta mais tarde, uma vez.
  const q = found.question;
  if (!q.kickoff && q.kind !== "retorno" && !isCovered(session, q.criterionId) && q.criterionId !== undefined && !q.retried) {
    session.queue.push({ ...q, id: `q-${session.queue.length + 1}`, status: "queued", snoozedUntil: t + IGNORED_RETRY_MS, retried: true });
  }
  // Abertura ignorada não conta contra o candidato: ele pode ter preferido codar.
  if (!found.question.kickoff) {
    session.evidence.push({
      t,
      criterionId: "comunicacao",
      note: `não abriu a pergunta sobre ${found.question.topicLabel ?? "o código"}`,
      source: "analyst",
    });
  }
  return pendingId;
}

function pickBlip(session: SessionState, t: number): { blip?: Blip; reason: string } {
  if (session.ended) return { reason: "sessão encerrada" };
  enqueueDueCheckIns(session, t);
  if (session.pendingBlipId) return { reason: "esperando: outro blip já aberto ou pendente" };

  const kickoff = session.queue.find((q) => q.kickoff && q.status === "queued");
  if (kickoff) {
    // Abertura: espera ele ler o enunciado, não interrompe digitação e some se ele já foi direto pro código.
    if (linesWrittenBeyondStarter(session) >= KICKOFF_SKIP_IF_LINES_WRITTEN) {
      kickoff.status = "stale";
      return { reason: "abertura descartada: candidato já começou a codar" };
    }
    if (t < KICKOFF_READING_MS) {
      return { reason: `esperando: tempo de leitura (faltam ${Math.ceil((KICKOFF_READING_MS - t) / 1000)} s)` };
    }
    if (!isCandidateIdle(session, t)) return { reason: "esperando: candidato digitando" };
    return { blip: raise(session, kickoff, t), reason: `blip ${kickoff.id} (abertura)` };
  }

  if (!isCandidateIdle(session, t)) return { reason: "esperando: candidato digitando" };

  const analystBlips = session.blips.filter((b) => !session.queue.some((q) => q.id === b.id && q.kickoff)).length;
  // O limite não barra retorno de desafio nem critério da agenda ainda não explorado.
  const overLimit = analystBlips >= MAX_ANALYST_BLIPS;

  const { boost, reason: boostReason } = momentBoost(session);
  const candidates = session.queue
    .filter((q) => q.status === "queued" && !isSnoozed(q, t))
    .filter((q) => !overLimit || q.kind === "retorno" || !isCovered(session, q.criterionId))
    .filter((q) => q.priority + boost + agendaBoost(session, q, t) >= BLIP_THRESHOLD)
    // Momento-chave primeiro (o candidato tem certeza que há o que falar), depois a prioridade.
    .sort(
      (a, b) =>
        Number(b.keyMoment !== undefined) - Number(a.keyMoment !== undefined) ||
        b.priority + (b.focusArea ? FOCUS_QUESTION_BONUS : 0) - (a.priority + (a.focusArea ? FOCUS_QUESTION_BONUS : 0)),
    );
  if (candidates.length === 0) {
    if (overLimit) return { reason: `limite de ${MAX_ANALYST_BLIPS} blips atingido` };
    const waiting = session.queue.filter((q) => q.status === "queued");
    if (waiting.length === 0) return { reason: "sem pergunta na fila" };
    const snoozed = waiting.filter((q) => isSnoozed(q, t));
    if (snoozed.length === waiting.length) {
      const backAt = Math.min(...snoozed.map((q) => q.snoozedUntil ?? t));
      return { reason: `esperando: pergunta adiada (volta em ${Math.ceil((backAt - t) / 1000)} s)` };
    }
    return { reason: `esperando: nenhuma pergunta acima de ${BLIP_THRESHOLD.toFixed(2)}` };
  }

  for (const q of candidates) {
    if (isStale(session, q, t)) {
      q.status = "stale";
      continue;
    }
    const wait = waitReason(session, t, q);
    if (wait !== undefined) return { reason: wait };
    const agenda = agendaBoost(session, q, t);
    const label =
      (boost > 0 ? ` (boost +${boost.toFixed(2)}: ${boostReason})` : "") + (agenda > 0 ? ` (agenda +${agenda.toFixed(2)})` : "");
    return { blip: raise(session, q, t), reason: `blip ${q.id}${label}` };
  }
  return { reason: "sem pergunta válida na fila (todas obsoletas)" };
}

/** Reforço de agenda: critério da recrutadora ainda não explorado, depois de parte do tempo. */
function agendaBoost(session: SessionState, q: QueuedQuestion, t: number): number {
  if (q.criterionId === undefined || isCovered(session, q.criterionId)) return 0;
  return t >= session.config.durationMin * 60_000 * AGENDA_START_FRACTION ? BOOST_UNCOVERED : 0;
}

function isFinalStretchForAgenda(session: SessionState, q: QueuedQuestion, t: number): boolean {
  if (q.criterionId === undefined || isCovered(session, q.criterionId)) return false;
  return session.config.durationMin * 60_000 - t <= FINAL_STRETCH_MS;
}

/**
 * Desafio topado vira pergunta de retorno quando chega a hora, o que vier primeiro:
 * rodou depois de mexer no código; mexeu e ficou 30 s parado; passaram 4 min; ou faltam 5 min.
 */
function enqueueDueCheckIns(session: SessionState, t: number): void {
  for (const checkIn of session.checkIns) {
    if (checkIn.status !== "aguardando") continue;
    const changed = session.codeHistory.filter((v) => v.t > checkIn.createdAt && v.version > checkIn.versionAtStart);
    const lastChange = changed.at(-1);
    const ranAfterChange =
      lastChange !== undefined && session.events.some((e) => e.type === "run" && e.t >= lastChange.t);
    const idleAfterChange = lastChange !== undefined && t - lastChange.t >= CHECK_IN_IDLE_MS && isCandidateIdle(session, t);
    const waitedLong = t - checkIn.createdAt >= CHECK_IN_MAX_WAIT_MS;
    const endingSoon = session.config.durationMin * 60_000 - t <= CHECK_IN_BEFORE_END_MS;
    if (!ranAfterChange && !idleAfterChange && !waitedLong && !endingSoon) continue;

    checkIn.status = "na_fila";
    session.queue.push({
      id: `q-${session.queue.length + 1}`,
      question: `E aí, como foi com o desafio de ${checkIn.challenge}? O que você pensou?`,
      followUpTopic: `o que ele tentou ou pensou para ${checkIn.challenge}`,
      topicLabel: "como foi o desafio",
      priority: 0.95,
      createdAt: t,
      status: "queued",
      // Como momento-chave: passa na frente e pula o intervalo entre blips.
      keyMoment: "retorno de um desafio que o candidato topou",
      kind: "retorno",
      criterionId: checkIn.criterionId,
      checkInId: checkIn.id,
    });
  }
}

/** Pergunta adiada pelo candidato ("agora não") que ainda não voltou. */
function isSnoozed(q: QueuedQuestion, t: number): boolean {
  return q.snoozedUntil !== undefined && q.snoozedUntil > t;
}

/** Motivo de espera pelo ritmo (aquecimento e intervalos), ou undefined se já pode aparecer. */
function waitReason(session: SessionState, t: number, q: QueuedQuestion): string | undefined {
  if (t < WARMUP_MS) return `esperando: aquecimento (faltam ${Math.ceil((WARMUP_MS - t) / 1000)} s)`;

  // Cada fase tem seu ritmo: não corta quem está escrevendo a primeira versão nem quem está no meio de uma melhoria.
  const fase = faseDaEntrevista(session);
  const quiet = Math.floor((t - (session.codeHistory.at(-1)?.t ?? 0)) / 1000);
  if (fase === "implementando" && q.keyMoment === undefined && quiet * 1000 < IMPLEMENTING_IDLE_MS) {
    return `esperando: escrevendo a primeira versão (${quiet} s sem mexer, mín. ${IMPLEMENTING_IDLE_MS / 1000} s)`;
  }
  // Pergunta de foco (processo, sem código) não corta quem ainda está fazendo o código funcionar.
  if (q.focusArea !== undefined && (fase === "implementando" || fase === "depurando") && session.config.durationMin * 60_000 - t > FINAL_STRETCH_MS) {
    return `esperando: pergunta de foco só depois que o código funcionar (fase ${fase})`;
  }
  const exempt = q.kind === "retorno" || q.keyMoment !== undefined || isFinalStretchForAgenda(session, q, t);
  if (fase === "otimizando" && !exempt && quiet * 1000 < OPTIMIZING_IDLE_MS) {
    return `esperando: mexendo para melhorar a solução (${quiet} s sem mexer, mín. ${OPTIMIZING_IDLE_MS / 1000} s)`;
  }

  // Prioridade alta, momento-chave e critério não explorado na reta final pulam a regra de 60 s entre blips.
  const skipsSpacing = q.priority >= HIGH_PRIORITY || q.keyMoment !== undefined || isFinalStretchForAgenda(session, q, t);
  const lastBlip = session.blips.at(-1);
  if (lastBlip && !skipsSpacing && t - lastBlip.createdAt < MIN_GAP_BETWEEN_BLIPS_MS) {
    const elapsed = Math.floor((t - lastBlip.createdAt) / 1000);
    return `esperando: ${elapsed} s desde o último blip (mín. ${MIN_GAP_BETWEEN_BLIPS_MS / 1000} s)`;
  }

  const endedAt = session.lastConversationEndedAt;
  if (endedAt !== undefined && t - endedAt < MIN_GAP_AFTER_CONVERSATION_MS) {
    const elapsed = Math.floor((t - endedAt) / 1000);
    return `esperando: ${elapsed} s desde o fim da última conversa (mín. ${MIN_GAP_AFTER_CONVERSATION_MS / 1000} s)`;
  }
  return undefined;
}

/**
 * Pergunta que perdeu o sentido: a entrevista mudou de fase desde que ela foi criada, ela esperou demais, ou
 * as linhas grifadas mudaram. Retorno de desafio, pergunta de foco (de processo) e pergunta adiada pelo
 * candidato não envelhecem pela fase nem pelo tempo.
 */
function isStale(session: SessionState, q: QueuedQuestion, t: number): boolean {
  const ageless = q.kind === "retorno" || q.focusArea !== undefined || q.snoozedUntil !== undefined;
  if (!ageless) {
    if (q.fase !== undefined && q.fase !== faseDaEntrevista(session)) return true;
    if (t - q.createdAt > QUESTION_MAX_AGE_MS) return true;
  }
  return linesChanged(session, q);
}

/**
 * As linhas grifadas mudaram desde a versão do código em que a pergunta foi criada.
 * Sem grifo, ou sem versão anterior ao createdAt, não há como comparar.
 */
function linesChanged(session: SessionState, q: QueuedQuestion): boolean {
  if (q.highlight === undefined) return false;
  const { startLine, endLine } = q.highlight;
  const createdVersion = session.codeHistory.filter((v) => v.t <= q.createdAt).at(-1);
  if (createdVersion === undefined) return false;
  const latest = session.codeHistory.at(-1)?.code ?? "";
  return linesOf(createdVersion.code, startLine, endLine) !== linesOf(latest, startLine, endLine);
}

function linesOf(code: string, startLine: number, endLine: number): string {
  return code.split("\n").slice(startLine - 1, endLine).join("\n");
}

function raise(session: SessionState, q: QueuedQuestion, t: number): Blip {
  q.status = "blipped";
  const blip: Blip = {
    id: q.id,
    preview: previewFor(q),
    priority: q.priority,
    createdAt: t,
    highlight: q.highlight,
  };
  session.blips.push(blip);
  session.pendingBlipId = blip.id;
  return blip;
}

/** Texto curto do balão. Nunca a pergunta inteira. */
function previewFor(q: QueuedQuestion): string {
  if (q.kickoff) return "Quando quiser, uma pergunta rápida";
  if (q.kind === "retorno") return "E aí, como foi o desafio?";
  return q.topicLabel ? `Quero entender ${q.topicLabel}` : "Tenho uma pergunta sobre seu código";
}

export function allPassed(result: RunResult): boolean {
  return result.total > 0 && result.passed === result.total;
}
