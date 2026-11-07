/**
 * Interviewer: fala com o candidato por texto, numa conversa de blip ou quando ele chama.
 * Um turno por chamada. Erro do LLM nunca vira erro de API: volta uma fala de reserva.
 */
import { InterviewerOutput } from "@/lib/agents/interviewerSchema";
import { buildInterviewerSystem, buildInterviewerUser, type InterviewerTurnInput } from "@/lib/agents/prompts/interviewer";
import { findBlipQuestion, nextHint } from "@/lib/agents/policy";
import type { ChatMessage, ChatResponse, EditorCommand, LineRange } from "@/lib/contracts";
import { completeJson } from "@/lib/llm";
import { appendEvent, latestCode, numberCode } from "@/lib/session/store";
import type { SessionState } from "@/lib/session/types";
import { getProblem } from "@/problems";

const FALLBACK_REPLY = "Desculpa, me perdi aqui. Pode repetir?";

export async function runInterviewerTurn(
  session: SessionState,
  req: { blipId?: string; messages: ChatMessage[] },
): Promise<ChatResponse> {
  const found = req.blipId !== undefined ? findBlipQuestion(session, req.blipId) : undefined;
  if (req.blipId !== undefined && !found) throw new Error(`blip desconhecido: ${req.blipId}`);

  const code = latestCode(session);
  const lineCount = code.split("\n").length;
  const hint = nextHint(session);
  const input: InterviewerTurnInput = {
    mode: found ? "blip" : "candidate",
    elapsedLabel: formatMmSs(elapsedMs(session)),
    remainingLabel: formatMmSs(Math.max(0, session.config.durationMin * 60_000 - elapsedMs(session))),
    language: session.language,
    numberedCode: numberCode(code),
    question: found?.question.question,
    followUpTopic: found?.question.followUpTopic,
    kickoff: found?.question.kickoff,
    questionHighlight: found?.question.highlight,
    availableHint: hint,
    analystNotes: analystNotesOf(session),
    previousQuestions: session.queue
      .filter((q) => q.status === "asked" && q.id !== found?.question.id)
      .map((q) => q.question),
    messages: req.messages,
  };

  let output: InterviewerOutput;
  try {
    const result = await completeJson({
      role: "interviewer",
      system: buildInterviewerSystem(session.config, getProblem(session.config.problemId)),
      user: buildInterviewerUser(input),
      schema: InterviewerOutput,
    });
    session.analyst.costUsd += result.costUsd;
    output = result.data;
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

  const highlight = output.highlight ? clampLines(output.highlight, lineCount) : undefined;
  const commands: EditorCommand[] = highlightCommands(highlight);
  if (output.end) commands.push({ type: "clear_highlights" });

  if (output.gaveHint && hint !== undefined) {
    appendEvent(session, {
      type: "hint",
      sessionId: session.sessionId,
      t: elapsedMs(session),
      level: session.hintsUsed + 1,
      text: hint,
    });
  }
  if (output.evidence) {
    session.evidence.push({
      t: elapsedMs(session),
      criterionId: output.evidence.criterionId,
      note: output.evidence.note,
      source: "interviewer",
    });
  }
  if (output.end) session.lastConversationEndedAt = elapsedMs(session);

  return { reply: output.reply, commands, end: output.end };
}

function elapsedMs(session: SessionState): number {
  return Date.now() - session.startedAt;
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
