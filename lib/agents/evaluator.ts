/**
 * Evaluator: nota final da sessão. O objetivo (testes escondidos, dicas, colagens) é calculado aqui;
 * o LLM só julga os critérios subjetivos, e cada evidência dele precisa citar um momento real da sessão.
 * Nota geral e recomendação também saem daqui, não do LLM.
 */
import { OBJECTIVE_CRITERION } from "@/lib/agents/coverage";
import { empecilhoAnunciado, PREFIXO_TESTE, primeiraAdaptacao } from "@/lib/agents/empecilho";
import { EvaluatorOutput } from "@/lib/agents/evaluatorSchema";
import { runHiddenTests, runServerTests, type HiddenTestsResult } from "@/lib/agents/hiddenTests";
import { allPassed } from "@/lib/agents/policy";
import { buildEvaluatorSystem, buildEvaluatorUser } from "@/lib/agents/prompts/evaluator";
import { CONCEITOS_EMPECILHO, type Report, type SessionEvent } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import { completeJson } from "@/lib/llm";
import { gravacaoDaSessao } from "@/lib/session/gravacao";
import { saveReport } from "@/lib/session/reports";
import { latestCode, numberCode } from "@/lib/session/store";
import type { CodeVersion, ProbeKind, ReportStatus, SessionState } from "@/lib/session/types";
import { getProblem } from "@/problems";

/** Colagem a partir disso conta como "grande" nos sinais. */
const LARGE_PASTE_LINES = 5;
const MAX_CODE_VERSIONS = 6;
const LLM_ATTEMPTS = 2;

// Em globalThis, como o store: o hot reload do Next não pode perder uma avaliação em curso.
const globalWithEvals = globalThis as typeof globalThis & {
  __evaluations?: WeakMap<SessionState, Promise<void>>;
};
const inFlight = (globalWithEvals.__evaluations ??= new WeakMap<SessionState, Promise<void>>());

/**
 * Começa a avaliação se ainda não começou (ou se falhou e `retry`). Idempotente: o session_ended
 * e o GET /api/report podem chamar à vontade. Devolve o estado atual.
 */
export function startEvaluation(session: SessionState, opts: { retry?: boolean } = {}): ReportStatus {
  const current = session.report;
  if (current && !(opts.retry && current.state === "error")) return current;

  const status: ReportStatus = { state: "running", startedAt: Date.now(), costUsd: 0 };
  session.report = status;
  const job = evaluate(session, status)
    .then((report) => {
      status.report = report;
      status.state = "done";
      // Em disco para o painel da vaga sobreviver a restart; falhar aqui não derruba o relatório.
      saveReport(session.startedAt, report, gravacaoDaSessao(session)).catch((err: unknown) => console.error("[evaluator] não salvou o relatório:", err));
    })
    .catch((err: unknown) => {
      status.error = err instanceof Error ? err.message : String(err);
      status.state = "error";
      console.error("[evaluator] falhou:", status.error);
    })
    .finally(() => {
      status.durationMs = Date.now() - status.startedAt;
    });
  inFlight.set(session, job);
  return status;
}

/** Espera a avaliação em curso terminar (para scripts). */
export async function waitForEvaluation(session: SessionState): Promise<ReportStatus | undefined> {
  await inFlight.get(session);
  return session.report;
}

async function evaluate(session: SessionState, status: ReportStatus): Promise<Report> {
  const { config } = session;
  const problem = getProblem(config.problemId);
  const code = latestCode(session);
  const endT = endTime(session);

  const hidden = await runHiddenTests(problem, code, session.language);
  status.hiddenTests = hidden;

  // Empecilho: os testes da mudança (os que a IDE mostrou e os escondidos dela) rodam no código final.
  const anunciado = empecilhoAnunciado(session);
  const mudancaTests = anunciado
    ? await runServerTests(
        problem,
        [...anunciado.empecilho.tests, ...(anunciado.empecilho.hiddenTests ?? [])],
        code,
        session.language,
        PREFIXO_TESTE,
      )
    : undefined;

  const timeline = buildTimeline(session);
  // Sem nenhuma sondagem, observação ou fala do candidato, nem vai para o LLM: vira null. O resto o LLM julga
  // (e pode devolver null se não houve oportunidade de observar).
  const judgedIds = config.criteria
    .map((c) => c.id)
    .filter((id) => id !== OBJECTIVE_CRITERION && isExplored(session, id));
  const adaptacao = anunciado && mudancaTests ? adaptationFacts(session, mudancaTests, endT) : undefined;
  const system = buildEvaluatorSystem(
    config,
    problem,
    judgedIds,
    anunciado && {
      title: anunciado.empecilho.title,
      statement: anunciado.empecilho.statement,
      conceito: CONCEITOS_EMPECILHO[anunciado.empecilho.concept],
      rubricNote: anunciado.empecilho.rubricNote,
    },
  );
  const user = buildEvaluatorUser({
    coverage: timeline.coverage,
    durationLabel: formatMs(endT),
    language: session.language,
    signals: describeSignals(session, hidden),
    timeline: timeline.lines,
    codeVersions: timeline.codeVersions,
    analystNotes: timeline.analystNotes,
    adaptation: adaptacao?.lines,
  });

  const output = await judge(system, user, judgedIds, status);
  const byId = new Map(output.criteria.map((c) => [c.id, c]));

  const criteria = config.criteria.map((c) => {
    if (c.id === OBJECTIVE_CRITERION) return { id: c.id, name: c.name, ...correctness(session, hidden, endT) };
    const judged = byId.get(c.id);
    if (!judged || !judgedIds.includes(c.id) || judged.score === null) {
      return { id: c.id, name: c.name, score: null, evidence: [{ t: endT, text: "Não explorado na entrevista." }] };
    }
    return {
      id: c.id,
      name: c.name,
      score: judged.score,
      // Evidência com tempo que não existe na sessão é invenção do modelo: sai do relatório.
      evidence: judged.evidence.flatMap((e) => {
        const t = timeline.labels.get(e.at.trim());
        return t === undefined ? [] : [{ t, text: e.text }];
      }),
    };
  });

  // Média só dos critérios explorados (corretude sempre tem nota).
  const scored = config.criteria.flatMap((c, i) => {
    const score = criteria[i].score;
    return score === null ? [] : [{ score, weight: c.weight }];
  });
  const totalWeight = scored.reduce((sum, c) => sum + c.weight, 0);
  const weighted = scored.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;
  const overall = Math.round(Math.min(4, Math.max(1, weighted)) * 10) / 10;
  const tests = testCounts(session, hidden);

  return {
    sessionId: session.sessionId,
    configId: config.id,
    roleTitle: config.roleTitle,
    recommendation: overall >= 3 ? "avancar" : overall >= 2 ? "talvez" : "nao_avancar",
    overallScore: overall,
    criteria,
    summary: output.summary,
    strengths: output.strengths,
    concerns: output.concerns,
    nextSteps: output.nextSteps,
    signals: {
      testsPassed: tests.passed,
      testsTotal: tests.total,
      hintsUsed: session.hintsUsed,
      pastes: session.events.filter((e) => e.type === "paste").length,
      durationMs: endT,
    },
    adaptation:
      anunciado && adaptacao
        ? {
            empecilhoId: anunciado.empecilho.id,
            kind: anunciado.empecilho.kind,
            concept: anunciado.empecilho.concept,
            title: anunciado.empecilho.title,
            announcedAt: anunciado.announcedAt,
            adaptedAt: adaptacao.adaptedAt,
            testsPassed: adaptacao.passed,
            testsTotal: adaptacao.total,
            score: adaptationScore(output.adaptation?.score ?? null, adaptacao),
            evidence: (output.adaptation?.evidence ?? []).flatMap((e) => {
              const t = timeline.labels.get(e.at.trim());
              return t === undefined ? [] : [{ t, text: e.text }];
            }),
          }
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Adaptação à mudança (empecilho)
// ---------------------------------------------------------------------------

interface AdaptationFacts {
  /** Para o prompt. */
  lines: string[];
  adaptedAt: number | null;
  passed: number;
  total: number;
}

/** Fatos objetivos da adaptação: quando a mudança veio, quando passou e como ficou no código final. */
function adaptationFacts(session: SessionState, tests: HiddenTestsResult, endT: number): AdaptationFacts | undefined {
  const anunciado = empecilhoAnunciado(session);
  if (!anunciado) return undefined;
  const adapted = primeiraAdaptacao(session);
  const adaptedAt = adapted?.t ?? null;
  const runsAfter = session.events.filter((e): e is RunEvent => e.type === "run" && e.t >= anunciado.announcedAt);

  // Sem execução no servidor, vale a última execução do candidato depois da mudança.
  let passed = 0;
  let total = 0;
  let failed: string[] = [];
  if (tests.ran) {
    passed = tests.passed;
    total = tests.total;
    failed = tests.cases.filter((c) => !c.passed).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`);
  } else {
    const cases = runsAfter.at(-1)?.result.cases.filter((c) => c.name.startsWith(PREFIXO_TESTE)) ?? [];
    passed = cases.filter((c) => c.passed).length;
    total = cases.length;
    failed = cases.filter((c) => !c.passed).map((c) => c.name);
  }

  const restante = Math.max(0, endT - anunciado.announcedAt);
  const lines = [
    `A mudança veio em ${formatMs(anunciado.announcedAt)}, faltando ${formatMs(restante)} para o fim da sessão.`,
    `Execuções depois da mudança: ${runsAfter.length}.`,
    adaptedAt === null
      ? "Nenhuma execução depois da mudança passou em todos os testes dela."
      : `Os testes da mudança passaram pela primeira vez em ${formatMs(adaptedAt)} (${formatMs(adaptedAt - anunciado.announcedAt)} depois do anúncio).`,
    total > 0
      ? `Código final nos testes da mudança${tests.ran ? " (incluindo os escondidos dela)" : " (última execução dele)"}: ${passed}/${total}${failed.length ? `; falharam: ${failed.join("; ")}` : ""}.`
      : `Testes da mudança não rodaram no código final${tests.ran ? "" : ` (${tests.reason})`}.`,
  ];
  return { lines, adaptedAt, passed, total };
}

/** Código final que não cumpre a regra nova não passa de 2, diga o LLM o que disser. */
function adaptationScore(judged: number | null, facts: AdaptationFacts): number | null {
  if (judged === null) return null;
  return facts.total > 0 && facts.passed < facts.total ? Math.min(judged, 2) : judged;
}

/** Chama o LLM; tenta de novo se faltar critério na resposta. */
async function judge(system: string, user: string, judgedIds: string[], status: ReportStatus): Promise<EvaluatorOutput> {
  let lastError = "";
  for (let attempt = 1; attempt <= LLM_ATTEMPTS; attempt++) {
    const result = await completeJson({ role: "evaluator", system, user, schema: EvaluatorOutput });
    status.costUsd += result.costUsd;
    const missing = judgedIds.filter((id) => !result.data.criteria.some((c) => c.id === id));
    if (missing.length === 0) return result.data;
    lastError = `o modelo não avaliou: ${missing.join(", ")}`;
    console.warn(`[evaluator] tentativa ${attempt}: ${lastError}`);
  }
  throw new Error(lastError);
}

// ---------------------------------------------------------------------------
// Sinais objetivos
// ---------------------------------------------------------------------------

type RunEvent = Extract<SessionEvent, { type: "run" }>;
type ScoreWithEvidence = Pick<Report["criteria"][number], "score" | "evidence">;

/** Nota de corretude pelos testes escondidos (ou pelos visíveis, se não deu para rodar no servidor). */
function correctness(session: SessionState, hidden: HiddenTestsResult, endT: number): ScoreWithEvidence {
  if (hidden.ran) {
    const failed = hidden.cases.filter((c) => !c.passed);
    const onlyLargeFailed = failed.length > 0 && failed.every((c) => c.large);
    const score = failed.length === 0 ? 4 : onlyLargeFailed ? 3 : hidden.passed / hidden.total >= 0.5 ? 2 : 1;
    const detail = failed.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`).join("; ");
    return {
      score,
      evidence: [
        {
          t: endT,
          text:
            failed.length === 0
              ? `Passou em todos os ${hidden.total} testes escondidos, incluindo o caso grande.`
              : `Passou em ${hidden.passed} de ${hidden.total} testes escondidos. Falhou: ${detail}.`,
        },
      ],
    };
  }

  const lastRun = session.events.filter((e): e is RunEvent => e.type === "run").at(-1);
  if (!lastRun) {
    return { score: 1, evidence: [{ t: endT, text: `Nunca rodou o código. Testes escondidos não rodaram: ${hidden.reason}.` }] };
  }
  const { passed, total } = lastRun.result;
  // Sem os escondidos não dá para confirmar bordas e desempenho: no máximo 3.
  const score = allPassed(lastRun.result) ? 3 : total > 0 && passed / total >= 0.5 ? 2 : 1;
  return {
    score,
    evidence: [
      {
        t: lastRun.t,
        text: `Última execução: ${passed}/${total} testes visíveis. Testes escondidos não rodaram: ${hidden.reason}.`,
      },
    ],
  };
}

function testCounts(session: SessionState, hidden: HiddenTestsResult): { passed: number; total: number } {
  if (hidden.ran) return { passed: hidden.passed, total: hidden.total };
  const lastRun = session.events.filter((e): e is RunEvent => e.type === "run").at(-1);
  return { passed: lastRun?.result.passed ?? 0, total: lastRun?.result.total ?? 0 };
}

function describeSignals(session: SessionState, hidden: HiddenTestsResult): string[] {
  const runs = session.events.filter((e): e is RunEvent => e.type === "run");
  const firstGreen = runs.find((r) => allPassed(r.result));
  const pastes = session.events.filter((e) => e.type === "paste");
  const largePastes = pastes.filter((e) => e.type === "paste" && e.lines >= LARGE_PASTE_LINES);
  const candidateSpeech = session.events.filter((e) => e.type === "speech" && e.role === "candidate");
  const firstSpeech = candidateSpeech[0];
  const firstCode = firstCodeVersion(session);
  const insights = session.analyst.insights;
  const asked = session.queue.filter((q) => q.status === "asked").length;
  const ignored = session.queue.filter((q) => q.status === "ignored").length;
  const snoozed = session.events.filter((e) => e.type === "blip_snoozed").length;

  const signals = [
    hidden.ran
      ? `Testes escondidos: ${hidden.passed}/${hidden.total} passaram${hidden.cases.some((c) => !c.passed) ? ` (falharam: ${hidden.cases.filter((c) => !c.passed).map((c) => `${c.name}${c.detail ? ` — ${c.detail}` : ""}`).join("; ")})` : ""}. A nota de corretude já sai disso.`
      : `Testes escondidos não rodaram (${hidden.reason}).`,
    `Execuções: ${runs.length}${firstGreen ? `; primeira com todos os testes visíveis passando em ${formatMs(firstGreen.t)}` : "; nunca passou em todos os visíveis"}.`,
    `Dicas usadas: ${session.hintsUsed}.`,
    `Colagens: ${pastes.length}${largePastes.length > 0 ? ` (${largePastes.length} com ${LARGE_PASTE_LINES}+ linhas)` : ""}.`,
    `Falas do candidato: ${candidateSpeech.length}${firstSpeech ? `, a primeira em ${formatMs(firstSpeech.t)}` : ""}. Começou a escrever código em ${firstCode ? formatMs(firstCode.t) : "(nunca)"}.`,
    `Perguntas do entrevistador: ${asked} respondidas, ${snoozed} adiadas, ${ignored} ignoradas.`,
  ];
  if (insights) {
    signals.push(
      `Última leitura do analista: ${insights.approach} Tempo ${insights.timeComplexity}, memória ${insights.spaceComplexity}.`,
    );
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Linha do tempo para o prompt
// ---------------------------------------------------------------------------

interface Timeline {
  lines: string[];
  /** Por critério, como ele se saiu em cada sondagem ("[03:10] respondeu_bem: …"). */
  coverage: string[];
  codeVersions: string[];
  analystNotes: string[];
  /** mm:ss citável → t. Só tempos que aparecem no prompt. */
  labels: Map<string, number>;
}

function buildTimeline(session: SessionState): Timeline {
  const labels = new Map<string, number>();
  const label = (t: number): string => {
    const l = formatMs(t);
    if (!labels.has(l)) labels.set(l, t);
    return `[${l}]`;
  };

  const firstCode = firstCodeVersion(session);
  const lines: string[] = [];
  let firstCodeShown = false;
  for (const e of session.events) {
    if (!firstCodeShown && firstCode && e.t >= firstCode.t) {
      lines.push(`${label(firstCode.t)} começou a escrever código`);
      firstCodeShown = true;
    }
    const text = describeEvent(session, e);
    if (text !== undefined) lines.push(`${label(e.t)} ${text}`);
  }

  const codeVersions = pickCodeVersions(session).map(
    (v) => `${label(v.t)} versão ${v.version} (${v.language}):\n${numberCode(v.code)}`,
  );
  const analystNotes = session.evidence.map((n) => `${label(n.t)} (${n.criterionId}) ${n.note}`);
  const coverage = session.config.criteria.map((c) => {
    const outcomes = session.coverage[c.id]?.outcomes ?? [];
    const items = outcomes.map((o) => `  ${label(o.t)} ${OUTCOME_LABELS[o.kind]}: ${o.note}`);
    return `- ${c.id}:${items.length ? `\n${items.join("\n")}` : " nenhuma sondagem registrada (use a linha do tempo e as observações)"}`;
  });
  const challenges = session.checkIns.map((ci) => {
    const volta = ci.status === "feito" ? " (o entrevistador voltou para conferir)" : " (o entrevistador não chegou a voltar)";
    return ci.empecilhoId
      ? `${label(ci.createdAt)} recebeu a mudança no problema e precisou ${ci.challenge}${volta}`
      : `${label(ci.createdAt)} topou o desafio de ${ci.challenge}${volta}`;
  });
  return { lines, coverage: [...coverage, ...challenges], codeVersions, analystNotes, labels };
}

const OUTCOME_LABELS: Record<ProbeKind, string> = {
  espontaneo: "mostrou por conta própria",
  respondeu_bem: "respondeu bem quando perguntado",
  parcial: "respondeu em parte",
  errou: "errou",
  nao_conseguiu: "não conseguiu",
  com_dica: "chegou lá com dica",
  recusou: "preferiu não responder",
};

/** Teve sondagem, observação do analista ou do entrevistador, ou ao menos uma conversa com o candidato. */
function isExplored(session: SessionState, criterionId: string): boolean {
  return (
    (session.coverage[criterionId]?.outcomes.length ?? 0) > 0 ||
    session.evidence.some((n) => n.criterionId === criterionId) ||
    session.events.some((e) => e.type === "speech" && e.role === "candidate")
  );
}

function describeEvent(session: SessionState, e: SessionEvent): string | undefined {
  switch (e.type) {
    case "session_started":
      return "sessão começou";
    case "speech":
      return `${e.role === "candidate" ? "CANDIDATO" : "entrevistador"}: ${truncate(e.text, 500)}`;
    case "run": {
      const failing = e.result.cases.find((c) => !c.passed);
      const detail = failing
        ? ` — ${failing.name}: esperado ${failing.expected ?? "?"}, obteve ${failing.got ?? failing.error ?? "?"}`
        : "";
      const fatal = e.result.cases.length === 0 && e.result.stderr ? ` — erro: ${truncate(e.result.stderr, 160)}` : "";
      const mudanca = e.result.cases.filter((c) => c.name.startsWith(PREFIXO_TESTE));
      const daMudanca = mudanca.length
        ? ` (${mudanca.filter((c) => c.passed).length}/${mudanca.length} da mudança)`
        : "";
      return `rodou: ${e.result.passed}/${e.result.total} testes${mudanca.length ? "" : " visíveis"}${daMudanca}${detail}${fatal}`;
    }
    case "paste":
      return `colou ${e.lines} linhas (${e.chars} caracteres) na linha ${e.startLine}`;
    case "hint":
      return `recebeu dica nível ${e.level}: ${truncate(e.text, 200)}`;
    case "language_changed":
      return `mudou a linguagem para ${e.language}`;
    case "empecilho":
      return `MUDANÇA NO PROBLEMA trazida pelo entrevistador (${e.kind === "requisito" ? "o requisito mudou" : "entrou um caso novo"}): ${e.title}; exige ${CONCEITOS_EMPECILHO[e.concept]}`;
    case "blip_opened": {
      const q = session.queue.find((item) => item.id === e.blipId);
      return `abriu a pergunta do entrevistador${q ? `: "${q.question}"` : ""}`;
    }
    case "blip_snoozed":
      return "adiou uma pergunta do entrevistador (\"agora não\")";
    case "session_ended":
      return e.reason === "timeout" ? "tempo esgotado" : "encerrou a sessão";
    default:
      return undefined; // snapshot, pause e blip_closed só fariam ruído
  }
}

/** Primeira versão com algo além do código inicial. */
function firstCodeVersion(session: SessionState): CodeVersion | undefined {
  const starters = getProblem(session.config.problemId).public.starters;
  return session.codeHistory.find((v) => v.code.trim() !== (starters[v.language] ?? "").trim());
}

/** Primeira versão escrita, a versão de cada execução e a final, sem repetir código. */
function pickCodeVersions(session: SessionState): CodeVersion[] {
  const history = session.codeHistory;
  const atRuns = session.events
    .filter((e) => e.type === "run")
    .map((run) => history.filter((v) => v.t <= run.t).at(-1))
    .filter((v): v is CodeVersion => v !== undefined);
  const candidates = [firstCodeVersion(session), ...atRuns, history.at(-1)].filter(
    (v): v is CodeVersion => v !== undefined,
  );
  const unique: CodeVersion[] = [];
  for (const v of candidates) {
    if (!unique.some((u) => u.code === v.code)) unique.push(v);
  }
  // Muitas execuções: fica a primeira e as mais recentes (a final sempre entra).
  return unique.length <= MAX_CODE_VERSIONS ? unique : [unique[0], ...unique.slice(-(MAX_CODE_VERSIONS - 1))];
}

function endTime(session: SessionState): number {
  const ended = session.events.find((e) => e.type === "session_ended");
  return ended?.t ?? session.events.at(-1)?.t ?? 0;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
