/**
 * Liga os hooks do Slack ao módulo de email. Efeito de módulo: só precisa
 * ser importado (por efeito colateral) em algum ponto de entrada das rotas
 * do Slack pra registrar os hooks via `setSlackHooks`.
 */
import { setSlackHooks } from "./hooks";
import { scheduleInterviewsForPlan } from "./scheduling";
import { sendFeedbackForDecision } from "./feedback";

setSlackHooks({
  onPlanApproved: scheduleInterviewsForPlan,
  onCandidateDecision: sendFeedbackForDecision,
});
