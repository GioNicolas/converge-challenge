/**
 * Aprendizado: que dica ele precisou, quanto levou para destravar e como reagiu à mudança no problema.
 * Tudo sai dos eventos da sessão (run, snapshot, hint, speech, empecilho), nunca da opinião do LLM: o Evaluator
 * manda estes fatos para o prompt e o LLM só julga como ele usou a ajuda.
 *
 * - Travou: duas execuções seguidas falhando sem passar em mais testes, ou 2 min parado sem mexer no código
 *   e sem conversa, com o código ainda falhando.
 * - Destravou: a primeira execução depois disso com mais testes passando que o melhor até ali (ou todos).
 *
 * Travamento e dica medem só os testes do problema original. A mudança (empecilho) tem a medida dela, pelos
 * testes "Mudança: ", porque os dois somados mudariam de tamanho no meio da sessão.
 */
import { empecilhoAnunciado, PREFIXO_TESTE, primeiraAdaptacao } from "@/lib/agents/empecilho";
import { CONCEITOS_EMPECILHO, type Report, type SessionEvent, type StuckEpisode } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import type { SessionState } from "@/lib/session/types";
import { getProblem } from "@/problems";

/** Sem mexer no código por esse tempo (e sem conversa), com o código falhando, conta como travado. */
export const PARADO_MS = 120_000;
/** Travamento ou dica sem avanço só limita a nota se sobrou esse tempo até o fim para reagir. */
const TEMPO_PARA_REAGIR_MS = 3 * 60_000;

type RunEvent = Extract<SessionEvent, { type: "run" }>;
type HintEvent = Extract<SessionEvent, { type: "hint" }>;
type Learning = NonNullable<Report["learning"]>;

export interface LearningFacts {
  hints: Learning["hints"];
  hintsAvailable: number;
  stuck: StuckEpisode[];
  change?: Learning["change"];
  /** Houve algo para observar (dica, travamento ou mudança)? Sem isso a nota é null e nem vai para o LLM. */
  hasMoment: boolean;
  /** Para o prompt. */
  lines: string[];
  /** Tempos citados em `lines`: o Evaluator aceita evidência com eles. */
  times: number[];
}

/** Resultado de uma execução só nos testes do problema original (sem os da mudança). */
function original(run: RunEvent): { passed: number; green: boolean } {
  const cases = run.result.cases.filter((c) => !c.name.startsWith(PREFIXO_TESTE));
  const passed = cases.filter((c) => c.passed).length;
  return { passed, green: cases.length > 0 && passed === cases.length };
}

/** Melhor número de testes passando nas execuções até `t` (inclusive). */
function bestUntil(runs: RunEvent[], t: number): number {
  return runs.filter((r) => r.t <= t).reduce((best, r) => Math.max(best, original(r).passed), 0);
}

/** Primeira execução depois de `from` com mais testes passando que `baseline`, ou todos. */
function firstProgress(runs: RunEvent[], from: number, baseline: number): RunEvent | undefined {
  return runs.find((r) => {
    if (r.t <= from) return false;
    const o = original(r);
    return o.green || o.passed > baseline;
  });
}

interface Interval {
  startedAt: number;
  unstuckAt: number | null;
  cause: StuckEpisode["cause"];
}

/** Duas ou mais execuções seguidas falhando sem passar em mais testes que o melhor até ali. */
function failedStreaks(runs: RunEvent[]): Interval[] {
  const out: Interval[] = [];
  let best = -1;
  let streakStart: RunEvent | undefined;
  let streak = 0;
  let open: number | undefined;
  for (const run of runs) {
    const o = original(run);
    if (o.green || o.passed > best) {
      if (open !== undefined) out.push({ startedAt: open, unstuckAt: run.t, cause: "falhas_seguidas" });
      open = undefined;
      best = Math.max(best, o.passed);
      streakStart = o.green ? undefined : run;
      streak = o.green ? 0 : 1;
      continue;
    }
    streakStart ??= run;
    streak += 1;
    if (streak >= 2 && open === undefined) open = streakStart.t;
  }
  if (open !== undefined) out.push({ startedAt: open, unstuckAt: null, cause: "falhas_seguidas" });
  return out;
}

/** 2 min ou mais sem mexer no código, sem conversa, com o código escrito e ainda falhando. */
function idleGaps(session: SessionState, runs: RunEvent[], endT: number): Interval[] {
  const starters = getProblem(session.config.problemId).public.starters;
  const firstCode = session.codeHistory.find((v) => v.code.trim() !== (starters[v.language] ?? "").trim());
  if (!firstCode) return [];
  const changes = session.codeHistory.filter((v) => v.t >= firstCode.t && v.t <= endT).map((v) => v.t);
  const talk = session.events
    .filter((e) => e.type === "speech" || e.type === "blip_opened" || e.type === "blip_closed")
    .map((e) => e.t);

  const out: Interval[] = [];
  changes.forEach((a, i) => {
    const b = changes[i + 1] ?? endT;
    if (b - a < PARADO_MS) return;
    if (talk.some((t) => t >= a && t <= b)) return;
    const last = runs.filter((r) => r.t < b).at(-1);
    if (last && original(last).green) return;
    // Execução no meio da parada roda o mesmo código: o destrave só vem depois que ele volta a mexer.
    out.push({ startedAt: a, unstuckAt: firstProgress(runs, b, bestUntil(runs, b))?.t ?? null, cause: "parado" });
  });
  return out;
}

/** Junta travamentos que se sobrepõem (parado no meio de falhas seguidas é o mesmo travamento). */
function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((x, y) => x.startedAt - y.startedAt);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const prev = out.at(-1);
    const prevEnd = prev ? (prev.unstuckAt ?? Infinity) : -Infinity;
    if (prev && cur.startedAt <= prevEnd) {
      prev.unstuckAt = prev.unstuckAt === null || cur.unstuckAt === null ? null : Math.max(prev.unstuckAt, cur.unstuckAt);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function hintsAvailable(session: SessionState): number {
  const n = getProblem(session.config.problemId).private.hints.length;
  if (session.config.hints === "nenhuma") return 0;
  return session.config.hints === "leves" ? Math.min(1, n) : n;
}

export function learningFacts(session: SessionState, endT: number): LearningFacts {
  const runs = session.events.filter((e): e is RunEvent => e.type === "run" && e.t <= endT);
  const hintEvents = session.events.filter((e): e is HintEvent => e.type === "hint" && e.t <= endT);
  const times: number[] = [];
  const at = (t: number): string => {
    times.push(t);
    return formatMs(t);
  };

  const hints: Learning["hints"] = hintEvents.map((h) => {
    const before = runs.filter((r) => r.t < h.t);
    const codePassing = before.length > 0 && original(before.at(-1)!).green;
    const progress = codePassing ? undefined : firstProgress(runs, h.t, bestUntil(runs, h.t));
    const runsAfter = runs.filter((r) => r.t > h.t && (progress === undefined || r.t <= progress.t)).length;
    return { t: h.t, level: h.level, text: h.text, codePassing, unstuckAt: progress?.t ?? null, runsAfter };
  });

  const stuck: StuckEpisode[] = merge([...failedStreaks(runs), ...idleGaps(session, runs, endT)]).map((iv) => {
    const end = iv.unstuckAt ?? endT;
    return {
      ...iv,
      failedRuns: runs.filter((r) => r.t >= iv.startedAt && r.t < end && !original(r).green).length,
      hintLevels: hintEvents.filter((h) => h.t >= iv.startedAt && h.t <= end).map((h) => h.level),
    };
  });

  let change: Learning["change"];
  const anunciado = empecilhoAnunciado(session);
  if (anunciado) {
    const { announcedAt } = anunciado;
    const adapted = primeiraAdaptacao(session);
    const end = adapted?.t ?? endT;
    const evento = session.events.find(
      (e): e is Extract<SessionEvent, { type: "empecilho" }> =>
        e.type === "empecilho" && e.empecilhoId === anunciado.empecilho.id,
    );
    change = {
      concept: anunciado.empecilho.concept,
      announcedAt,
      adaptedAt: adapted?.t ?? null,
      failedAttempts: runs.filter((r) => r.t >= announcedAt && r.t < end).length,
      hintsUsed: hintEvents.filter((h) => h.t >= announcedAt && h.t <= end).length,
      conversationTurns: evento
        ? session.events.filter((e) => e.type === "speech" && e.role === "candidate" && e.blipId === evento.blipId).length
        : 0,
    };
  }

  // Linhas para o prompt.
  const available = hintsAvailable(session);
  const lines: string[] = [`Dicas que a vaga permitia nesta questão: ${available}. Usadas: ${hints.length}.`];
  for (const h of hints) {
    const contexto = h.codePassing
      ? "veio com o código já passando nos testes visíveis (o avanço não se mede pelos testes)"
      : stuck.some((s) => s.hintLevels.includes(h.level))
        ? "veio com ele travado"
        : "veio sem ele estar travado pelos critérios do sistema";
    const depois = h.codePassing
      ? `${h.runsAfter} execuções depois dela`
      : h.unstuckAt === null
        ? `depois dela, ${h.runsAfter} execuções e nenhuma passou em mais testes até o fim`
        : `passou em mais testes em ${at(h.unstuckAt)} (${formatMs(h.unstuckAt - h.t)} depois da dica, ${h.runsAfter} execução(ões))`;
    lines.push(`Dica nível ${h.level} em ${at(h.t)} ("${h.text}"): ${contexto}; ${depois}.`);
  }
  if (stuck.length === 0) {
    lines.push("Nenhum travamento detectado nos testes do problema original.");
  }
  for (const s of stuck) {
    const como =
      s.cause === "falhas_seguidas"
        ? "execuções seguidas falhando sem passar em mais testes"
        : `${formatMs(PARADO_MS)} ou mais sem mexer no código, com ele falhando`;
    const ajuda = s.hintLevels.length ? `com a dica ${s.hintLevels.join(" e ")}` : "sem dica";
    const saida =
      s.unstuckAt === null
        ? `não destravou até o fim (${s.failedRuns} execuções falhando, ${ajuda})`
        : `destravou em ${at(s.unstuckAt)} (${formatMs(s.unstuckAt - s.startedAt)} depois, ${s.failedRuns} execuções falhando no meio, ${ajuda})`;
    lines.push(`Travou em ${at(s.startedAt)} (${como}); ${saida}.`);
  }
  if (change) {
    const adaptou =
      change.adaptedAt === null
        ? "não passou nos testes dela até o fim"
        : `passou nos testes dela em ${at(change.adaptedAt)} (${formatMs(change.adaptedAt - change.announcedAt)} depois)`;
    lines.push(
      `Mudança no problema em ${at(change.announcedAt)} (exige ${CONCEITOS_EMPECILHO[change.concept]}): ${adaptou}; ${change.failedAttempts} execução(ões) antes sem passar nos testes dela; ${change.hintsUsed} dica(s) no meio; ele falou ${change.conversationTurns} vez(es) na conversa da mudança.`,
    );
  }

  return {
    hints,
    hintsAvailable: available,
    stuck,
    change,
    hasMoment: hints.length > 0 || stuck.length > 0 || change !== undefined,
    lines,
    times,
  };
}

/**
 * Nota do aprendizado limitada pelos fatos: travou (ou recebeu dica) e não avançou mais, tendo tempo para isso,
 * fica no máximo 2; precisou de duas ou mais dicas, no máximo 3.
 */
export function learningScore(judged: number | null, facts: LearningFacts, endT: number): number | null {
  if (judged === null || !facts.hasMoment) return null;
  const teveTempo = (t: number) => endT - t >= TEMPO_PARA_REAGIR_MS;
  const naoDestravou =
    facts.stuck.some((s) => s.unstuckAt === null && teveTempo(s.startedAt)) ||
    facts.hints.some((h) => !h.codePassing && h.unstuckAt === null && teveTempo(h.t));
  if (naoDestravou) return Math.min(judged, 2);
  if (facts.hints.length >= 2) return Math.min(judged, 3);
  return judged;
}
