/**
 * Contratos do módulo de Slack. Independentes de `lib/contracts.ts`.
 * Dois pontos de decisão humana: revisar o plano e aprovar/reprovar candidato.
 * Todo o resto (agendamento, no-show, remarcação) é do agente e não passa por aqui.
 */
import type { InterviewPlan } from "@/lib/hiring/job-posting";
import type { Report } from "@/lib/contracts";

export type PlanStatus = "em_revisao" | "aprovado";

export interface StoredPlan {
  /** Um plano por vaga: usamos o id da vaga. */
  planId: string;
  jobTitle: string;
  plan: InterviewPlan;
  version: number;
  status: PlanStatus;
  channel?: string;
  /** ts da mensagem do card, necessário para chat.update. */
  ts?: string;
  reviewer?: string;
  /** Pedidos de ajuste do tech lead, em ordem. */
  comments: string[];
}

/** Sessão de teste: alguém do time entra como se fosse o candidato. Sem candidato, sem email. */
export interface TestSession {
  sessionId: string;
  token: string;
  planId: string;
  createdBy: string;
  createdAt: number;
}

export type DecisionStatus = "aguardando" | "aprovado" | "reprovado";

export interface DecisionRecord {
  /** Normalmente o sessionId da entrevista. */
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  report: Report;
  status: DecisionStatus;
  channel?: string;
  ts?: string;
  decidedBy?: string;
  reason?: string;
}

/** Pontos de extensão: quem integra decide o que acontece depois do clique. */
export interface SlackHooks {
  /** Plano aprovado: o agente assume e começa a agendar. */
  onPlanApproved(plan: StoredPlan): Promise<void> | void;
  /**
   * Tech lead pediu ajuste. Se devolver um plano novo, o card é atualizado
   * com ele; se devolver undefined, o card fica "em revisão" aguardando.
   */
  revisePlan(plan: StoredPlan, comment: string): Promise<InterviewPlan | void> | InterviewPlan | void;
  /** Decisão sobre o candidato: aqui se envia o email de feedback. */
  onCandidateDecision(record: DecisionRecord): Promise<void> | void;
}

/** Ids de ação/modal compartilhados entre blocks.ts e o handler. */
export const ACTION = {
  planApprove: "plan_approve",
  planAdjust: "plan_adjust",
  planTest: "plan_test",
  candApprove: "cand_approve",
  candReject: "cand_reject",
} as const;

export const MODAL = {
  planAdjust: "plan_adjust_modal",
  candReject: "cand_reject_modal",
} as const;
