/**
 * Liga os hooks do Slack ao módulo de email e à Memória Viva da Squad. Efeito de módulo: só precisa
 * ser importado (por efeito colateral) em algum ponto de entrada das rotas do Slack pra registrar os
 * hooks via `setSlackHooks`.
 */
import { setSlackHooks } from "./hooks";
import { scheduleInterviewsForPlan } from "./scheduling";
import { sendFeedbackForDecision } from "./feedback";
import { aprenderDaDecisao, aprenderDoAjuste } from "./squad";

setSlackHooks({
  onPlanApproved: scheduleInterviewsForPlan,
  // O email e o aprendizado são independentes: um falhar não impede o outro.
  onCandidateDecision: async (r) => {
    await Promise.allSettled([sendFeedbackForDecision(r), aprenderDaDecisao(r)]).then((rs) =>
      rs.forEach((x) => x.status === "rejected" && console.error("[slack] decisão:", x.reason)),
    );
  },
  // Sem agente de revisão ligado: o Totti aprende com o pedido e o card fica "revisando" (devolve undefined).
  revisePlan: async (sp, comentario) => {
    await aprenderDoAjuste(sp, comentario);
  },
});
