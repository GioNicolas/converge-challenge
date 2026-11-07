/**
 * Analyst: lê o código com um LLM, atualiza os insights e enfileira perguntas seguras.
 * Uma análise por sessão por vez; gatilhos que chegam durante uma análise viram uma rodada extra.
 */
import type { AnalystQuestion } from "@/lib/agents/analystSchema";
import { AnalystOutput } from "@/lib/agents/analystSchema";
import { buildAnalystSystem, buildAnalystUser } from "@/lib/agents/prompts/analyst";
import { checkQuestion } from "@/lib/agents/spoilerFilter";
import type { LineRange, SessionEvent } from "@/lib/contracts";
import { completeJson } from "@/lib/llm";
import { latestCode, numberCode } from "@/lib/session/store";
import type { SessionState } from "@/lib/session/types";
import { getProblem } from "@/problems";

/** Estado de controle do Analyst por sessão (fora de SessionState, que é o que a API expõe). */
interface AnalystBookkeeping {
  running: boolean;
  /** Gatilho da próxima rodada; definido quando chega evento durante uma análise em curso. */
  rerunTrigger?: SessionEvent;
  /** Código e t do gatilho da última análise concluída com sucesso. */
  lastCompletedCode?: string;
  lastCompletedT?: number;
  /** Pause adiado pela janela de 15 s: no máximo um por sessão (um novo substitui o anterior). */
  deferredTimer?: ReturnType<typeof setTimeout>;
}

type PauseEvent = Extract<SessionEvent, { type: "pause" }>;

const PAUSE_MIN_GAP_MS = 15_000;

// Em globalThis, como o store: o Next em dev recarrega o módulo ao compilar outra rota, e um
// WeakMap local zeraria no meio da sessão (já causou ids de pergunta repetidos).
const globalWithBook = globalThis as typeof globalThis & {
  __analystBookkeeping?: WeakMap<SessionState, AnalystBookkeeping>;
};
const bookkeeping = (globalWithBook.__analystBookkeeping ??= new WeakMap<SessionState, AnalystBookkeeping>());

function bookkeepingFor(session: SessionState): AnalystBookkeeping {
  let book = bookkeeping.get(session);
  if (!book) {
    book = { running: false };
    bookkeeping.set(session, book);
  }
  return book;
}

export async function runAnalyst(session: SessionState, trigger: SessionEvent): Promise<void> {
  const book = bookkeepingFor(session);
  if (book.running) {
    book.rerunTrigger = trigger;
    return;
  }

  book.running = true;
  try {
    let current: SessionEvent | undefined = trigger;
    while (current) {
      book.rerunTrigger = undefined;
      await analyzeOnce(session, book, current);
      current = book.rerunTrigger;
    }
  } finally {
    book.running = false;
  }
}

/** Uma análise. Nunca lança: erros viram `analyst.lastError`. */
async function analyzeOnce(session: SessionState, book: AnalystBookkeeping, trigger: SessionEvent): Promise<void> {
  const code = latestCode(session);
  if (code.trim() === "") {
    session.analyst.lastOutcome = { t: trigger.t, text: "pulada: código vazio" };
    return;
  }
  if ((trigger.type === "pause" || trigger.type === "paste") && code === book.lastCompletedCode) {
    session.analyst.lastOutcome = { t: trigger.t, text: "pulada: código igual à última análise" };
    return;
  }
  const lastStartedAt = session.analyst.lastRunAt;
  if (trigger.type === "pause" && lastStartedAt !== undefined && trigger.t - lastStartedAt < PAUSE_MIN_GAP_MS) {
    deferPause(session, book, trigger, PAUSE_MIN_GAP_MS - (trigger.t - lastStartedAt));
    return;
  }

  const analyst = session.analyst;
  analyst.state = "running";
  analyst.lastTrigger = trigger.type;
  analyst.lastRunAt = trigger.t;
  analyst.runs += 1;

  try {
    const since = book.lastCompletedT ?? -1;
    const problem = getProblem(session.config.problemId);
    const system = buildAnalystSystem(session.config, problem);
    const user = buildAnalystUser({
      elapsedLabel: formatElapsed(trigger.t),
      trigger: trigger.type,
      language: session.language,
      numberedCode: numberCode(code),
      recentEvents: session.events.flatMap((e) => {
        const line = describeEvent(e);
        return e.t > since && line !== undefined ? [`[${formatElapsed(e.t)}] ${line}`] : [];
      }),
      previousApproach: analyst.insights?.approach,
      askedQuestions: session.queue
        .filter((q) => q.status === "asked" || q.status === "blipped")
        .map((q) => q.question),
    });

    const result = await completeJson({ role: "analyst", system, user, schema: AnalystOutput });
    const { questions, ...insights } = result.data;

    for (const q of session.queue) {
      if (q.status === "queued" && !q.kickoff) q.status = "stale";
    }
    analyst.insights = insights;
    analyst.costUsd += result.costUsd;
    analyst.lastDurationMs = result.durationMs;
    analyst.lastError = undefined;
    book.lastCompletedCode = code;
    book.lastCompletedT = trigger.t;

    // Observações pra rubrica: sem duplicata exata (mesmo critério e mesma nota).
    for (const e of result.data.evidence) {
      const duplicate = session.evidence.some((n) => n.criterionId === e.criterionId && n.note === e.note);
      if (!duplicate) {
        session.evidence.push({ t: trigger.t, criterionId: e.criterionId, note: e.note, source: "analyst" });
      }
    }

    const lineCount = code.split("\n").length;
    const candidates = questions.map((q) => ({ question: q, lines: clampLines(q, lineCount) }));
    // O tema de aprofundamento também vai pro entrevistador, então passa pelo filtro junto.
    const verdicts = await Promise.all(
      candidates.map(({ question }) =>
        checkQuestion(question.question, question.followUpTopic),
      ),
    );

    let blocked = 0;
    candidates.forEach(({ question, lines }, i) => {
      const verdict = verdicts[i];
      analyst.costUsd += verdict.costUsd;
      if (!verdict.safe) {
        blocked += 1;
        console.info(`[analyst] pergunta rejeitada (${verdict.reason}): ${question.question}`);
        return;
      }
      // A fila nunca perde itens (stale continua lá), então o tamanho dá um id único.
      session.queue.push({
        id: `q-${session.queue.length + 1}`,
        question: question.question,
        followUpTopic: question.followUpTopic,
        topicLabel: question.topicLabel,
        priority: question.priority,
        highlight: lines,
        createdAt: trigger.t,
        status: "queued",
      });
    });
    analyst.lastOutcome = {
      t: trigger.t,
      text:
        questions.length === 0
          ? "o modelo achou que não valia perguntar agora"
          : `${questions.length} perguntas geradas, ${blocked} barradas pelo filtro`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    analyst.lastError = message;
    analyst.lastOutcome = { t: trigger.t, text: `erro: ${truncate(message, 80)}` };
    console.error("[analyst] falha na análise:", message);
  } finally {
    analyst.state = "idle";
  }
}

/**
 * Adia um pause que caiu dentro da janela de 15 s: a análise roda uma vez, quando a janela fechar,
 * com o t avançado pelo tempo esperado. Se a sessão acabar antes, o timer não roda.
 */
function deferPause(session: SessionState, book: AnalystBookkeeping, trigger: PauseEvent, waitMs: number): void {
  clearTimeout(book.deferredTimer);
  session.analyst.lastOutcome = {
    t: trigger.t,
    text: `adiada: menos de 15 s desde a última (roda em ${Math.ceil(waitMs / 1000)}s)`,
  };
  book.deferredTimer = setTimeout(() => {
    book.deferredTimer = undefined;
    if (session.ended) return;
    void runAnalyst(session, { ...trigger, t: trigger.t + waitMs });
  }, waitMs);
}

/** Mantém o grifo dentro das linhas do código e com endLine >= startLine. */
function clampLines(question: AnalystQuestion, lineCount: number): LineRange {
  const startLine = clamp(question.startLine, 1, lineCount);
  const endLine = clamp(question.endLine, startLine, lineCount);
  return { startLine, endLine };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Linha do evento para o prompt, ou undefined se o tipo não entra no contexto do Analyst. */
function describeEvent(event: SessionEvent): string | undefined {
  switch (event.type) {
    case "run": {
      const failing = event.result.cases.find((c) => !c.passed);
      const detail = failing
        ? ` — caso ${failing.name}: esperado ${failing.expected ?? "?"}, obteve ${failing.got ?? failing.error ?? "?"}`
        : "";
      return `rodou: ${event.result.passed}/${event.result.total} testes passaram${detail}`;
    }
    case "paste":
      return `colou ${event.lines} linhas a partir da linha ${event.startLine}`;
    case "speech": {
      const who = event.role === "candidate" ? "candidato" : "entrevistador";
      return `${who} disse: ${truncate(event.text, 200)}`;
    }
    case "hint":
      return "pediu dica";
    case "language_changed":
      return `mudou a linguagem para ${event.language}`;
    case "blip_closed":
      return "conversa encerrada";
    default:
      return undefined;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Tempo de sessão em mm:ss. */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
