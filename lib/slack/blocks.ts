/** Block Kit: cards e modais. Só monta JSON, não chama a API. */
import type { Report } from "@/lib/contracts";
import { ACTION, MODAL, type DecisionRecord, type StoredPlan } from "./types";

type Block = Record<string, unknown>;

const md = (text: string): Block => ({ type: "section", text: { type: "mrkdwn", text } });
const header = (text: string): Block => ({ type: "header", text: { type: "plain_text", text, emoji: true } });
const context = (text: string): Block => ({ type: "context", elements: [{ type: "mrkdwn", text }] });
const button = (text: string, actionId: string, value: string, style?: "primary" | "danger"): Block => ({
  type: "button",
  text: { type: "plain_text", text, emoji: true },
  action_id: actionId,
  value,
  ...(style ? { style } : {}),
});

const TOOL_LABEL: Record<string, string> = { code_editor: "Editor de código", whiteboard: "Whiteboard" };
const REC_LABEL: Record<Report["recommendation"], string> = {
  avancar: ":white_check_mark: Avançar",
  talvez: ":thinking_face: Talvez",
  nao_avancar: ":x: Não avançar",
};

function planBody(sp: StoredPlan): Block[] {
  const { plan } = sp;
  const stages = plan.stages
    .map(
      (s, i) =>
        `*${i + 1}. ${s.challenge.title}* — ${TOOL_LABEL[s.tool] ?? s.tool}, ${s.minutes} min\n${s.challenge.brief}\n_${s.rationale}_`,
    )
    .join("\n\n");
  const focus = plan.focusPoints.map((f) => `• ${f.topic} (${Math.round(f.weight * 100)}%)`).join("\n");
  const blocks: Block[] = [
    header(`Plano de entrevista: ${sp.jobTitle}`),
    context(`Versão ${sp.version}`),
    md(plan.summary),
    md(`*Etapas*\n${stages}`),
    md(`*Pontos de foco*\n${focus}`),
  ];
  if (plan.outOfScope.length) blocks.push(md(`*Fora do escopo*\n${plan.outOfScope.map((o) => `• ${o}`).join("\n")}`));
  return blocks;
}

export function planReviewBlocks(sp: StoredPlan): Block[] {
  const blocks = planBody(sp);
  if (sp.comments.length) blocks.push(context(`Último ajuste pedido: "${sp.comments[sp.comments.length - 1]}"`));
  blocks.push({
    type: "actions",
    elements: [
      button("Aprovar", ACTION.planApprove, sp.planId, "primary"),
      button("Pedir ajuste", ACTION.planAdjust, sp.planId),
      button("Testar entrevista", ACTION.planTest, sp.planId),
    ],
  });
  return blocks;
}

export function planApprovedBlocks(sp: StoredPlan): Block[] {
  return [
    ...planBody(sp),
    context(`:white_check_mark: Aprovado por <@${sp.reviewer}>. O agente vai agendar os candidatos.`),
    // Depois de aprovado ainda dá para reensaiar.
    { type: "actions", elements: [button("Testar entrevista", ACTION.planTest, sp.planId)] },
  ];
}

export function planRevisingBlocks(sp: StoredPlan): Block[] {
  return [
    ...planBody(sp),
    context(`:hourglass_flowing_sand: Ajuste pedido: "${sp.comments[sp.comments.length - 1]}". Revisando…`),
  ];
}

function reportBody(report: Report): Block[] {
  const list = (items: string[]) => (items.length ? items.map((i) => `• ${i}`).join("\n") : "—");
  return [
    md(
      `*Recomendação do agente:* ${REC_LABEL[report.recommendation]}  |  *Nota:* ${report.overallScore.toFixed(1)}/4\n` +
        `*Testes:* ${report.signals.testsPassed}/${report.signals.testsTotal}  |  *Dicas:* ${report.signals.hintsUsed}  |  *Colagens:* ${report.signals.pastes}`,
    ),
    md(report.summary),
    md(`*Pontos fortes*\n${list(report.strengths)}`),
    md(`*Preocupações*\n${list(report.concerns)}`),
    md(`*Para a próxima etapa*\n${list(report.nextSteps)}`),
  ];
}

export function decisionBlocks(r: DecisionRecord): Block[] {
  return [
    header(`${r.candidateName} — ${r.roleTitle}`),
    ...reportBody(r.report),
    {
      type: "actions",
      elements: [
        button("Aprovar", ACTION.candApprove, r.id, "primary"),
        button("Reprovar", ACTION.candReject, r.id, "danger"),
      ],
    },
  ];
}

export function decidedBlocks(r: DecisionRecord): Block[] {
  const line =
    r.status === "aprovado"
      ? `:white_check_mark: Aprovado por <@${r.decidedBy}>${r.reason ? ` — ${r.reason}` : ""}. Feedback enviado ao candidato.`
      : `:x: Reprovado por <@${r.decidedBy}>${r.reason ? ` — ${r.reason}` : ""}. Feedback enviado ao candidato.`;
  return [header(`${r.candidateName} — ${r.roleTitle}`), ...reportBody(r.report), context(line)];
}

/** Resultado de um teste: informativo, sem botões de decisão. */
export function testResultBlocks(report: Report, by: string): Block[] {
  return [
    header("Resultado do teste"),
    context(`Entrevista de teste feita por <@${by}>. Nada foi enviado a candidato.`),
    ...reportBody(report),
  ];
}

const textInput = (blockId: string, label: string, optional = false): Block => ({
  type: "input",
  block_id: blockId,
  optional,
  label: { type: "plain_text", text: label },
  element: { type: "plain_text_input", action_id: "value", multiline: true },
});

export function adjustModal(planId: string, channel: string, ts: string) {
  return {
    type: "modal",
    callback_id: MODAL.planAdjust,
    private_metadata: JSON.stringify({ planId, channel, ts }),
    title: { type: "plain_text", text: "Pedir ajuste" },
    submit: { type: "plain_text", text: "Enviar" },
    close: { type: "plain_text", text: "Cancelar" },
    blocks: [textInput("comment", "O que o agente deve mudar no plano?")],
  };
}

export function approveModal(decisionId: string, channel: string, ts: string) {
  return {
    type: "modal",
    callback_id: MODAL.candApprove,
    private_metadata: JSON.stringify({ decisionId, channel, ts }),
    title: { type: "plain_text", text: "Aprovar candidato" },
    submit: { type: "plain_text", text: "Aprovar" },
    close: { type: "plain_text", text: "Cancelar" },
    blocks: [
      textInput("reason", "O que te convenceu? (opcional)", true),
      context("Uma linha basta. O Totti usa para entrevistar o próximo candidato do jeito do time."),
    ],
  };
}

export function rejectModal(decisionId: string, channel: string, ts: string) {
  return {
    type: "modal",
    callback_id: MODAL.candReject,
    private_metadata: JSON.stringify({ decisionId, channel, ts }),
    title: { type: "plain_text", text: "Reprovar candidato" },
    submit: { type: "plain_text", text: "Reprovar" },
    close: { type: "plain_text", text: "Cancelar" },
    blocks: [
      textInput("reason", "Motivo (opcional, uso interno)", true),
      context("O Totti aprende só o que for técnico. Idade, formação, origem ou aparência são ignorados."),
    ],
  };
}

/** Resposta na thread depois de uma decisão: o que o Totti aprendeu e o que ignorou. */
export function aprendizadoBlocks(
  regras: { texto: string }[],
  ignorados: { trecho: string; porque: string }[],
  url: string,
): Block[] {
  const blocks: Block[] = [];
  for (const r of regras) blocks.push(md(`:brain: *Aprendi:* ${r.texto}`));
  for (const i of ignorados) {
    blocks.push(context(`:no_entry_sign: Ignorei "${i.trecho}": ${i.porque}. O Totti só aprende critério técnico.`));
  }
  blocks.push({
    type: "actions",
    elements: [{ type: "button", text: { type: "plain_text", text: "Ver o que aprendi", emoji: true }, url, action_id: "squad_ver" }],
  });
  return blocks;
}
