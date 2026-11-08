/**
 * Interviewer: fala com o candidato por texto, numa conversa de blip ou quando ele chama.
 * Um turno por chamada. Erro do LLM nunca vira erro de API: volta uma fala de reserva.
 */
import { InterviewerOutput } from "@/lib/agents/interviewerSchema";
import { buildInterviewerSystem, buildInterviewerUser, type InterviewerTurnInput } from "@/lib/agents/prompts/interviewer";
import { recordOutcome, uncoveredCriteria } from "@/lib/agents/coverage";
import { empecilhoAnunciado, empecilhoDaQuestao, mudancaParaPrompt, testesIde } from "@/lib/agents/empecilho";
import { CONVERSA_LIVRE, conversasFeitas, faseDaEntrevista, formatarConversas } from "@/lib/agents/fase";
import { findBlipQuestion, nextHint } from "@/lib/agents/policy";
import { checkReply } from "@/lib/agents/spoilerFilter";
import type { ChatMessage, ChatResponse, EditorCommand, LineRange } from "@/lib/contracts";
import { completeJson } from "@/lib/llm";
import { appendEvent, latestCode, numberCode, sessionNow } from "@/lib/session/store";
import type { SessionState } from "@/lib/session/types";
import { getProblem } from "@/problems";

const FALLBACK_REPLY = "Desculpa, me perdi aqui. Pode repetir?";
/** Fala barrada duas vezes pelo filtro: reconhece e fecha, sem arriscar. */
const SAFE_CLOSE_REPLY = "Entendi. Beleza, pode seguir.";
/** Orçamento de um turno: o candidato está esperando a voz. Passou disso, sai a fala de reserva. */
const PRAZO_TURNO_MS = 7_000;
/** Cada geração tem no máximo isto; o filtro de fala, bem menos. */
const PRAZO_GERACAO_MS = 4_500;
const PRAZO_FILTRO_MS = 1_800;
/** Só gera de novo (fala barrada) se ainda couber uma geração e um filtro no orçamento. */
const MIN_PARA_REGERAR_MS = 3_000;

export async function runInterviewerTurn(
  session: SessionState,
  req: { blipId?: string; messages: ChatMessage[] },
): Promise<ChatResponse> {
  const found = req.blipId !== undefined ? findBlipQuestion(session, req.blipId) : undefined;
  if (req.blipId !== undefined && !found) throw new Error(`blip desconhecido: ${req.blipId}`);

  // Empecilho: a primeira fala é o anúncio, fixo (sem LLM, não tem como falhar), e é ali que ele entra na linha do tempo.
  if (found?.question.kind === "empecilho" && req.messages.length === 0) {
    return { reply: anunciarEmpecilho(session, found.question.id), commands: [{ type: "clear_highlights" }], end: false };
  }

  const code = latestCode(session);
  const lineCount = code.split("\n").length;
  const question = found?.question;
  const checkInDoEmpecilho = question?.checkInId
    ? session.checkIns.find((c) => c.id === question.checkInId)?.empecilhoId !== undefined
    : false;
  // A dica leve é do problema original: na conversa da mudança e no retorno dela não se aplica.
  const semDica = question?.kind === "empecilho" || checkInDoEmpecilho;
  const hint = semDica ? undefined : nextHint(session);
  const anunciado = empecilhoAnunciado(session);
  // O que o filtro de fala deixa passar: a dica oficial e a regra nova, que o Totti pode repetir.
  const permitido =
    [hint, anunciado && `regra nova do problema, já anunciada ao candidato: ${anunciado.empecilho.statement}`]
      .filter(Boolean)
      .join(" | ") || undefined;
  const criterion = session.config.criteria.find((c) => c.id === question?.criterionId);
  const problem = getProblem(session.config.problemId);
  const checkIn = question?.checkInId ? session.checkIns.find((c) => c.id === question.checkInId) : undefined;
  const input: InterviewerTurnInput = {
    mode: found ? "blip" : "candidate",
    fase: faseDaEntrevista(session),
    elapsedLabel: formatMmSs(elapsedMs(session)),
    remainingLabel: formatMmSs(Math.max(0, session.config.durationMin * 60_000 - elapsedMs(session))),
    language: session.language,
    numberedCode: numberCode(code),
    question: found?.question.question,
    followUpTopic: found?.question.followUpTopic,
    kickoff: found?.question.kickoff,
    kind: question?.kind,
    criterion: criterion ? `${criterion.id}: ${criterion.name} — ${criterion.description}` : undefined,
    probeGuide: criterion ? problem.private.probeGuides?.[criterion.id] : undefined,
    challengeSummary: checkIn?.challenge,
    mudanca: mudancaParaPrompt(session, formatMmSs),
    mudancaClarifications:
      question?.kind === "empecilho" || checkInDoEmpecilho
        ? anunciado?.empecilho.clarifications.map((c) => `"${c.question}" → ${c.answer}`)
        : undefined,
    closingTopics: question?.closingTopics,
    questionHighlight: found?.question.highlight,
    availableHint: hint,
    uncovered: uncoveredCriteria(session)
      .filter((id) => id !== question?.criterionId)
      .map((id) => {
        const c = session.config.criteria.find((item) => item.id === id)!;
        return `${c.id}: ${c.name} — ${c.description}`;
      }),
    hintsPolicy: session.config.hints,
    analystNotes: analystNotesOf(session),
    // As conversas anteriores (sem a atual, que vai em `messages`).
    previousConversations: formatarConversas(
      // Na conversa livre, as falas recentes já vêm em `messages`.
      conversasFeitas(session).filter((c) => c.pergunta !== found?.question.question && (found || c.pergunta !== CONVERSA_LIVRE)),
    ),
    messages: req.messages,
  };

  const system = buildInterviewerSystem(session.config, problem);
  const user = buildInterviewerUser(input);
  const candidateLines = req.messages.filter((m) => m.role === "candidate").slice(-3).map((m) => m.text);
  let output: InterviewerOutput;
  const prazo = Date.now() + PRAZO_TURNO_MS;
  const sobra = () => prazo - Date.now();
  try {
    output = await generate(session, system, user, Math.min(PRAZO_GERACAO_MS, sobra()));
    // Filtro de fala: aponta bug, entrega solução ou confirma acerto? Gera de novo sabendo o motivo.
    const opening = found !== undefined && req.messages.length === 0;
    // O modelo escolheu escutar: não há fala para filtrar. A pergunta de um blip sempre sai.
    if (!opening && (!output.responder || !output.reply.trim())) {
      registrarObservacoes(session, output, question?.id);
      return { reply: "", commands: [], end: false, silent: true };
    }
    if (opening && !output.reply.trim()) output = { ...output, responder: true, reply: found.question.question };
    // A pergunta preparada já passou pelo filtro de perguntas: só confere se o modelo acrescentou algo.
    if (!(opening && isAboutTheSame(output.reply, found.question.question))) {
      const verdict = await checkReply(output.reply, candidateLines, permitido, code, Math.min(PRAZO_FILTRO_MS, sobra()));
      session.analyst.costUsd += verdict.costUsd;
      if (!verdict.safe && sobra() < MIN_PARA_REGERAR_MS) {
        console.info(`[interviewer] fala barrada (${verdict.reason}) sem tempo para outra: ${output.reply}`);
        output = opening
          ? { ...output, reply: found.question.question, highlight: found.question.highlight ?? null, end: false, gaveHint: false, challenge: null }
          : { ...output, reply: SAFE_CLOSE_REPLY, highlight: null, end: true, gaveHint: false, challenge: null };
      } else if (!verdict.safe) {
        console.info(`[interviewer] fala barrada (${verdict.reason}): ${output.reply}`);
        output = await generate(
          session,
          system,
          `${user}\n\nATENÇÃO: sua fala anterior ("${output.reply}") foi barrada: ${verdict.reason}. Escreva outra que não faça isso.`,
          Math.min(PRAZO_GERACAO_MS, sobra() - PRAZO_FILTRO_MS / 2),
        );
        const second = await checkReply(output.reply, candidateLines, permitido, code, Math.max(500, Math.min(PRAZO_FILTRO_MS, sobra())));
        session.analyst.costUsd += second.costUsd;
        if (!second.safe) {
          console.info(`[interviewer] fala barrada de novo (${second.reason}): ${output.reply}`);
          // Na abertura, a pergunta preparada (já filtrada); depois, reconhece e fecha.
          output = opening
            ? { ...output, reply: found.question.question, highlight: found.question.highlight ?? null, end: false, gaveHint: false, challenge: null }
            : { ...output, reply: SAFE_CLOSE_REPLY, highlight: null, end: true, gaveHint: false, challenge: null };
        }
      }
    }
  } catch (err) {
    console.error("[interviewer] falha no LLM:", err instanceof Error ? err.message : err);
    // Primeira fala de um blip: a pergunta preparada, com o grifo dela. Senão, pede pra repetir.
    if (found && req.messages.length === 0) {
      return {
        reply: found.question.question,
        commands: highlightCommands(found.question.highlight),
        end: false,
      };
    }
    return { reply: FALLBACK_REPLY, commands: [], end: false };
  }

  // A primeira fala de um blip é a pergunta: encerrar ali não deixaria o candidato responder.
  if (found && req.messages.length === 0) output.end = false;
  const t = elapsedMs(session);

  const highlight = output.highlight ? clampLines(output.highlight, lineCount) : undefined;
  const commands: EditorCommand[] = highlightCommands(highlight);
  if (output.end) commands.push({ type: "clear_highlights" });

  // Só conta como dica se a fala traz a dica de fato (o modelo às vezes marca gaveHint ao fechar).
  if (output.gaveHint && hint !== undefined && containsHint(output.reply, hint)) {
    appendEvent(session, {
      type: "hint",
      sessionId: session.sessionId,
      t: elapsedMs(session),
      level: session.hintsUsed + 1,
      text: hint,
    });
  }
  registrarObservacoes(session, output, question?.id);
  // Topou um desafio (da pergunta de desafio ou emendado numa sondagem): o agente volta depois para ver
  // como foi (policy.enqueueDueCheckIns). Nunca a partir de um retorno, para não virar um ciclo.
  if (
    question &&
    question.kind !== "retorno" &&
    question.kind !== "empecilho" &&
    output.challenge?.accepted &&
    !session.checkIns.some((c) => c.challengeId === question.id)
  ) {
    session.checkIns.push({
      id: `c-${session.checkIns.length + 1}`,
      challengeId: question.id,
      criterionId: question.criterionId,
      challenge: output.challenge.summary,
      createdAt: t,
      versionAtStart: session.codeHistory.at(-1)?.version ?? 0,
      status: "aguardando",
    });
  }
  if (output.end && checkIn) checkIn.status = "feito";
  if (output.end) session.lastConversationEndedAt = t;

  return { reply: output.reply, commands, end: output.end };
}

/** Evidência e resultado de sondagem que o modelo registrou (falando ou não). */
function registrarObservacoes(session: SessionState, output: InterviewerOutput, questionId: string | undefined): void {
  const t = elapsedMs(session);
  if (output.evidence) {
    session.evidence.push({ t, criterionId: output.evidence.criterionId, note: output.evidence.note, source: "interviewer" });
  }
  const outcome = output.probeOutcome;
  if (outcome) recordOutcome(session, { t, ...outcome, questionId, source: "interviewer" });
}

/**
 * Anuncia o empecilho (uma vez): grava o evento na linha do tempo com o conceito que ele exige e já agenda o
 * retorno ("como ficou com a mudança?"). Repetir a chamada (tentar de novo) só devolve o anúncio.
 */
function anunciarEmpecilho(session: SessionState, blipId: string): string {
  const empecilho = empecilhoDaQuestao(session);
  const state = session.empecilho;
  if (!empecilho || !state || state.blipId !== blipId) return FALLBACK_REPLY;
  if (state.announcedAt !== undefined) return empecilho.announcement;

  const t = elapsedMs(session);
  state.announcedAt = t;
  appendEvent(session, {
    type: "empecilho",
    sessionId: session.sessionId,
    t,
    empecilhoId: empecilho.id,
    kind: empecilho.kind,
    concept: empecilho.concept,
    title: empecilho.title,
    blipId,
    testNames: testesIde(session, empecilho.tests).map((teste) => teste.name),
  });
  session.checkIns.push({
    id: `c-${session.checkIns.length + 1}`,
    challengeId: blipId,
    challenge: `adaptar o código à mudança (${empecilho.title})`,
    createdAt: t,
    versionAtStart: session.codeHistory.at(-1)?.version ?? 0,
    status: "aguardando",
    empecilhoId: empecilho.id,
  });
  return empecilho.announcement;
}

/** Uma geração da fala no modelo de conversa (rápido, sem raciocínio), cancelada de verdade no prazo. */
async function generate(session: SessionState, system: string, user: string, prazoMs: number): Promise<InterviewerOutput> {
  const result = await completeJson({
    role: "conversa",
    system,
    user,
    schema: InterviewerOutput,
    prazoMs,
    signal: AbortSignal.timeout(Math.max(500, prazoMs)),
  });
  session.analyst.costUsd += result.costUsd;
  return result.data;
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-zà-ú]{4,}/g) ?? [];
}

/** A fala traz a dica: boa parte das palavras da dica aparecem nela. */
function containsHint(reply: string, hint: string): boolean {
  const said = new Set(words(reply));
  const hintWords = words(hint);
  return hintWords.length > 0 && hintWords.filter((w) => said.has(w)).length / hintWords.length >= 0.6;
}

/** A fala é praticamente a pergunta preparada: quase todas as palavras dela e quase nada a mais. */
function isAboutTheSame(reply: string, question: string): boolean {
  const asked = new Set(words(question));
  const said = words(reply);
  if (asked.size === 0 || said.length === 0) return false;
  const extra = said.filter((w) => !asked.has(w)).length;
  return containsHint(reply, question) && extra <= 2;
}

function elapsedMs(session: SessionState): number {
  return sessionNow(session);
}

function highlightCommands(range: LineRange | undefined): EditorCommand[] {
  return range ? [{ type: "highlight_range", startLine: range.startLine, endLine: range.endLine }] : [];
}

/** Mantém o grifo dentro das linhas do código e com endLine >= startLine. */
function clampLines(range: LineRange, lineCount: number): LineRange {
  const startLine = clamp(range.startLine, 1, lineCount);
  const endLine = clamp(range.endLine, startLine, lineCount);
  return { startLine, endLine };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Um parágrafo com o que o Analyst viu: abordagem, complexidade e trechos suspeitos. */
function analystNotesOf(session: SessionState): string | undefined {
  const insights = session.analyst.insights;
  if (!insights) return undefined;
  // Só a complexidade: a abordagem e as linhas suspeitas do analista às vezes citam o bug
  // ("sem verificar i == j"), e o entrevistador que sabe onde está o bug acaba apontando.
  return `Complexidade estimada: ${insights.timeComplexity} de tempo, ${insights.spaceComplexity} de espaço.`;
}

/** Tempo em mm:ss. */
function formatMmSs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
