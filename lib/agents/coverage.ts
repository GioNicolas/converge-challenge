/**
 * Agenda da entrevista: quais critérios da config já foram explorados e como o candidato se saiu.
 * A recrutadora define os critérios; tudo o que estiver lá precisa ser abordado.
 */
import type { ProbeOutcome, SessionState } from "@/lib/session/types";

/** Critério calculado pelos testes escondidos, sem pergunta: não entra na agenda nem no LLM do Evaluator. */
export const OBJECTIVE_CRITERION = "corretude";

/** Registra um resultado de sondagem. Ignora critério que não existe na config. */
export function recordOutcome(session: SessionState, outcome: ProbeOutcome): void {
  const coverage = session.coverage[outcome.criterionId];
  if (!coverage) return;
  coverage.outcomes.push(outcome);
  // Recusar ("quero codar primeiro") não explora o critério: ele continua na agenda.
  coverage.status = outcome.kind === "recusou" ? "em_andamento" : "coberto";
}

/** Critérios ainda sem nenhum resultado (fora o objetivo, que sai dos testes). */
export function uncoveredCriteria(session: SessionState): string[] {
  return session.config.criteria
    .map((c) => c.id)
    .filter((id) => id !== OBJECTIVE_CRITERION && session.coverage[id]?.status !== "coberto");
}

export function isCovered(session: SessionState, criterionId: string | undefined): boolean {
  return criterionId !== undefined && session.coverage[criterionId]?.status === "coberto";
}
