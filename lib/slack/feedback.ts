/**
 * Ponte entre a decisão do recrutador no Slack e o envio real do email de
 * feedback pro candidato. Chamada pelo hook `onCandidateDecision` (ligado
 * separadamente via `setSlackHooks`, em outro lugar).
 */
import { sendInterviewFeedback } from "@/lib/email";
import type { DecisionRecord } from "./types";

export async function sendFeedbackForDecision(record: DecisionRecord): Promise<void> {
  if (record.status === "aguardando") {
    console.warn(`[slack:feedback] decisão ainda aguardando para ${record.id}, nenhum email enviado`);
    return;
  }

  try {
    await sendInterviewFeedback({
      candidateName: record.candidateName,
      to: record.candidateEmail,
      roleTitle: record.roleTitle,
      recommendation: record.report.recommendation,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[slack:feedback] falha ao enviar email de feedback id=${record.id} status=${record.status} erro=${reason}`);
  }
}
