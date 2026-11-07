/**
 * Trata cliques de botão e envio de modal vindos do Slack.
 * O Slack exige resposta em 3 s: o trabalho lento (LLM, email) roda em `defer`.
 */
import {
  adjustModal,
  decidedBlocks,
  planApprovedBlocks,
  planReviewBlocks,
  planRevisingBlocks,
  rejectModal,
} from "./blocks";
import { slackApi } from "./client";
import { getSlackHooks } from "./hooks";
import { createTestSession } from "./session-link";
import { store } from "./store";
import { ACTION, MODAL } from "./types";

interface SlackUser {
  id: string;
}
interface Payload {
  type: "block_actions" | "view_submission" | string;
  user: SlackUser;
  trigger_id?: string;
  channel?: { id: string };
  message?: { ts: string };
  actions?: { action_id: string; value?: string }[];
  view?: {
    callback_id: string;
    private_metadata: string;
    state: { values: Record<string, Record<string, { value?: string | null }>> };
  };
}

export type Defer = (fn: () => Promise<void>) => void;

function fieldValue(p: Payload, blockId: string): string {
  return p.view?.state.values[blockId]?.value?.value?.trim() ?? "";
}

/** Roda o hook sem derrubar o handler: erro vira log. */
async function safe(label: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[slack] ${label} falhou:`, e);
  }
}

export async function handleInteraction(p: Payload, defer: Defer): Promise<void> {
  if (p.type === "block_actions") return handleAction(p, defer);
  if (p.type === "view_submission") return handleSubmission(p, defer);
}

async function handleAction(p: Payload, defer: Defer): Promise<void> {
  const action = p.actions?.[0];
  const id = action?.value;
  if (!action || !id) return;
  const channel = p.channel?.id ?? "";
  const ts = p.message?.ts ?? "";

  switch (action.action_id) {
    case ACTION.planApprove: {
      const sp = store.getPlan(id);
      if (!sp || sp.status === "aprovado") return; // clique duplo / reenvio
      sp.status = "aprovado";
      sp.reviewer = p.user.id;
      store.savePlan(sp);
      await slackApi("chat.update", { channel: sp.channel, ts: sp.ts, text: "Plano aprovado", blocks: planApprovedBlocks(sp) });
      defer(() => safe("onPlanApproved", () => getSlackHooks().onPlanApproved(sp)));
      return;
    }
    case ACTION.planAdjust: {
      if (!p.trigger_id || !store.getPlan(id)) return;
      await slackApi("views.open", { trigger_id: p.trigger_id, view: adjustModal(id, channel, ts) });
      return;
    }
    case ACTION.planTest: {
      const sp = store.getPlan(id);
      if (!sp) return;
      const { url } = createTestSession(sp.planId, p.user.id);
      // Mensagem só para quem clicou: o link de teste não é para o canal inteiro.
      await slackApi("chat.postEphemeral", {
        channel: channel || sp.channel,
        user: p.user.id,
        text: `Link da entrevista de teste: ${url}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Entrevista de teste* (${sp.jobTitle}, plano v${sp.version})\nEntre como se fosse o candidato: ${url}\n_Nada é enviado a candidato; o resultado volta para a thread do plano._`,
            },
          },
        ],
      });
      return;
    }
    case ACTION.candApprove: {
      const r = store.getDecision(id);
      if (!r || r.status !== "aguardando") return;
      r.status = "aprovado";
      r.decidedBy = p.user.id;
      store.saveDecision(r);
      await slackApi("chat.update", { channel: r.channel, ts: r.ts, text: "Candidato aprovado", blocks: decidedBlocks(r) });
      defer(() => safe("onCandidateDecision", () => getSlackHooks().onCandidateDecision(r)));
      return;
    }
    case ACTION.candReject: {
      if (!p.trigger_id || !store.getDecision(id)) return;
      await slackApi("views.open", { trigger_id: p.trigger_id, view: rejectModal(id, channel, ts) });
      return;
    }
  }
}

async function handleSubmission(p: Payload, defer: Defer): Promise<void> {
  const view = p.view;
  if (!view) return;
  const meta = JSON.parse(view.private_metadata) as Record<string, string>;

  if (view.callback_id === MODAL.planAdjust) {
    const sp = store.getPlan(meta.planId);
    const comment = fieldValue(p, "comment");
    if (!sp || !comment) return;
    sp.comments.push(comment);
    store.savePlan(sp);
    await slackApi("chat.update", { channel: sp.channel, ts: sp.ts, text: "Ajuste pedido", blocks: planRevisingBlocks(sp) });
    defer(async () => {
      await safe("revisePlan", async () => {
        const revised = await getSlackHooks().revisePlan(sp, comment);
        if (!revised) return; // sem agente de revisão ligado: o card fica "revisando"
        sp.plan = revised;
        sp.version += 1;
        sp.status = "em_revisao";
        store.savePlan(sp);
        await slackApi("chat.update", { channel: sp.channel, ts: sp.ts, text: "Plano revisado", blocks: planReviewBlocks(sp) });
      });
    });
    return;
  }

  if (view.callback_id === MODAL.candReject) {
    const r = store.getDecision(meta.decisionId);
    if (!r || r.status !== "aguardando") return;
    r.status = "reprovado";
    r.decidedBy = p.user.id;
    r.reason = fieldValue(p, "reason") || undefined;
    store.saveDecision(r);
    await slackApi("chat.update", { channel: r.channel, ts: r.ts, text: "Candidato reprovado", blocks: decidedBlocks(r) });
    defer(() => safe("onCandidateDecision", () => getSlackHooks().onCandidateDecision(r)));
  }
}
