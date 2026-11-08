/** Lado de saída: o agente chama estas funções para falar no Slack. */
import type { Report } from "@/lib/contracts";
import type { InterviewPlan } from "@/lib/hiring/job-posting";
import { slackApi } from "./client";
import { decisionBlocks, planReviewBlocks, testResultBlocks } from "./blocks";
import { store } from "./store";
import type { DecisionRecord, StoredPlan } from "./types";

function channel(): string {
  return process.env.SLACK_CHANNEL_ID ?? "";
}

/** Posta (ou atualiza, se for nova versão) o plano para o tech lead revisar. */
export async function postPlanForReview(input: {
  jobPostingId: string;
  jobTitle: string;
  plan: InterviewPlan;
}): Promise<StoredPlan> {
  const existing = store.getPlan(input.jobPostingId);
  const sp: StoredPlan = {
    planId: input.jobPostingId,
    jobTitle: input.jobTitle,
    plan: input.plan,
    version: (existing?.version ?? 0) + 1,
    status: "em_revisao",
    comments: existing?.comments ?? [],
    channel: existing?.channel,
    ts: existing?.ts,
  };
  const blocks = planReviewBlocks(sp);
  const text = `Plano de entrevista: ${sp.jobTitle}`;
  if (sp.channel && sp.ts) {
    await slackApi("chat.update", { channel: sp.channel, ts: sp.ts, text, blocks });
  } else {
    const res = await slackApi("chat.postMessage", { channel: channel(), text, blocks });
    sp.channel = res.channel || channel();
    sp.ts = res.ts;
  }
  store.savePlan(sp);
  return sp;
}

/** Posta o relatório de um candidato entrevistado, com Aprovar/Reprovar. */
export async function postCandidateDecision(input: {
  sessionId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  report: Report;
  /** Id da vaga (do plano). Sem valor: o `configId` do relatório. */
  vagaId?: string;
}): Promise<DecisionRecord> {
  const record: DecisionRecord = {
    id: input.sessionId,
    vagaId: input.vagaId,
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    candidateEmail: input.candidateEmail,
    roleTitle: input.roleTitle,
    report: input.report,
    status: "aguardando",
  };
  const res = await slackApi("chat.postMessage", {
    channel: channel(),
    text: `Entrevista concluída: ${record.candidateName}`,
    blocks: decisionBlocks(record),
  });
  record.channel = res.channel || channel();
  record.ts = res.ts;
  store.saveDecision(record);
  return record;
}

/** Chamar quando uma sessão de teste terminar: o resultado vai para a thread do plano. */
export async function postTestResult(sessionId: string, report: Report): Promise<boolean> {
  const test = store.getTestSession(sessionId);
  const plan = test && store.getPlan(test.planId);
  if (!test || !plan?.channel) return false;
  await slackApi("chat.postMessage", {
    channel: plan.channel,
    thread_ts: plan.ts,
    text: "Resultado do teste",
    blocks: testResultBlocks(report, test.createdBy),
  });
  return true;
}
