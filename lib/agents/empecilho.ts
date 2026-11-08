/**
 * Empecilho: no meio da entrevista o Totti traz uma mudança no problema (o requisito muda ou entra um caso
 * novo). Mede como o candidato reage quando algo muda, e pode acontecer antes de o código funcionar.
 *
 * O conteúdo vem pronto do pacote do problema (problems/<id>.ts, `private.empecilhos`), com testes de
 * verdade. Aqui fica quando ele entra, o que vai para a IDE e como medir a adaptação.
 */
import { faseDaEntrevista, linesWrittenBeyondStarter } from "@/lib/agents/fase";
import { CONCEITOS_EMPECILHO, PREFIXO_TESTE_MUDANCA, type EmpecilhoPublico, type SessionEvent, type TesteIde } from "@/lib/contracts";
import { problems as IDE_PROBLEMS } from "@/lib/problems";
import type { Empecilho, ProblemTest } from "@/lib/problems/types";
import type { SessionState } from "@/lib/session/types";
import { getProblem } from "@/problems";

/** Nome dos testes da mudança na IDE e no RunResult ("Mudança: Sem par"). */
export const PREFIXO_TESTE = PREFIXO_TESTE_MUDANCA;
/** A partir dessa fração do tempo: o candidato já teve tempo de montar uma direção. */
const A_PARTIR_DA_FRACAO = 0.3;
/** Precisa sobrar esse tempo para dar para adaptar; depois disso o empecilho não entra mais. */
const MINIMO_RESTANTE_MS = 8 * 60_000;
/** Linhas escritas além do código inicial: sem uma ideia no código, não há o que adaptar. */
const MINIMO_LINHAS = 4;
/** Respiro depois da última conversa e do último balão. */
const RESPIRO_MS = 20_000;
/** Não corta quem acabou de mexer no código: espera esse tempo sem mudança. */
const QUIETO_MS = 10_000;

type RunEvent = Extract<SessionEvent, { type: "run" }>;

/** O empecilho previsto para a questão da sessão (um por sessão: o primeiro do pacote). */
export function empecilhoDaQuestao(session: SessionState): Empecilho | undefined {
  return getProblem(session.config.problemId).private.empecilhos?.[0];
}

/** O empecilho que o Totti já anunciou nesta sessão, com o momento do anúncio. */
export function empecilhoAnunciado(session: SessionState): { empecilho: Empecilho; announcedAt: number } | undefined {
  const announcedAt = session.empecilho?.announcedAt;
  const empecilho = empecilhoDaQuestao(session);
  if (announcedAt === undefined || empecilho === undefined || empecilho.id !== session.empecilho?.id) return undefined;
  return { empecilho, announcedAt };
}

/**
 * Motivo de espera, ou undefined quando é hora de soltar o empecilho. Quem chama (policy.pickBlip) já
 * garantiu candidato parado e nenhum balão na tela.
 */
export function esperaDoEmpecilho(session: SessionState, t: number): string | undefined {
  if (session.config.mode === "system_design") return "sem empecilho no system design";
  if (session.empecilho) return "empecilho já saiu";
  if (!empecilhoDaQuestao(session)) return "questão sem empecilho";
  const duracao = session.config.durationMin * 60_000;
  if (duracao - t < MINIMO_RESTANTE_MS) return "empecilho: tempo curto demais para adaptar";
  if (t < duracao * A_PARTIR_DA_FRACAO) return "empecilho: cedo";
  if (faseDaEntrevista(session) === "entendendo" || linesWrittenBeyondStarter(session) < MINIMO_LINHAS) {
    return "empecilho: ainda sem ideia no código";
  }
  const ultimaConversa = session.lastConversationEndedAt;
  if (ultimaConversa !== undefined && t - ultimaConversa < RESPIRO_MS) return "empecilho: respiro depois da conversa";
  const ultimoBalao = session.blips.at(-1);
  if (ultimoBalao && t - ultimoBalao.createdAt < RESPIRO_MS) return "empecilho: respiro depois do último balão";
  const ultimaMudanca = session.codeHistory.at(-1)?.t ?? 0;
  if (t - ultimaMudanca < QUIETO_MS) return "empecilho: acabou de mexer no código";
  return undefined;
}

/** O que a IDE recebe: a regra nova e os testes no formato dela, com o prefixo "Mudança: ". */
export function empecilhoPublico(session: SessionState, empecilho: Empecilho): EmpecilhoPublico {
  return {
    id: empecilho.id,
    kind: empecilho.kind,
    concept: empecilho.concept,
    title: empecilho.title,
    statement: empecilho.statement,
    tests: testesIde(session, empecilho.tests),
  };
}

/** Testes do pacote (input por nome de parâmetro) no formato da IDE (argumentos em ordem). */
export function testesIde(session: SessionState, tests: ProblemTest[]): TesteIde[] {
  const ide = IDE_PROBLEMS[session.config.problemId];
  return tests.map((t, i) => ({
    name: `${PREFIXO_TESTE}${t.name ?? `caso ${i + 1}`}`,
    args: ide ? ide.native.params.map((p) => (t.input as Record<string, unknown>)[p.name]) : [],
    expected: t.expected,
  }));
}

/** Primeiro run depois do anúncio em que todos os testes da mudança passaram, ou undefined. */
export function primeiraAdaptacao(session: SessionState): RunEvent | undefined {
  const anunciado = empecilhoAnunciado(session);
  if (!anunciado) return undefined;
  const nomes = testesIde(session, anunciado.empecilho.tests).map((t) => t.name);
  return session.events.find(
    (e): e is RunEvent =>
      e.type === "run" &&
      e.t >= anunciado.announcedAt &&
      nomes.every((n) => e.result.cases.some((c) => c.name === n && c.passed)),
  );
}

/** Texto da mudança para os prompts (Analyst e Interviewer), ou undefined se ainda não foi anunciada. */
export function mudancaParaPrompt(session: SessionState, elapsedLabel: (t: number) => string): string | undefined {
  const anunciado = empecilhoAnunciado(session);
  if (!anunciado) return undefined;
  const { empecilho, announcedAt } = anunciado;
  return `Às ${elapsedLabel(announcedAt)} o entrevistador trouxe uma mudança no problema, que vale daqui pra frente: ${empecilho.statement} (exige: ${CONCEITOS_EMPECILHO[empecilho.concept]}). Os testes da mudança agora aparecem junto com os visíveis.`;
}
