/**
 * O que acontece depois de um clique. Os defaults só logam; quem integra troca
 * com `setSlackHooks` (ex.: ligar onCandidateDecision ao módulo de email).
 */
import type { SlackHooks } from "./types";

const defaults: SlackHooks = {
  onPlanApproved: (p) => console.info(`[slack] plano aprovado: ${p.planId} v${p.version} (hook não configurado)`),
  revisePlan: (p, c) => console.info(`[slack] ajuste pedido em ${p.planId}: "${c}" (hook não configurado)`),
  onCandidateDecision: (r) =>
    console.info(`[slack] ${r.candidateName}: ${r.status} (hook não configurado, nenhum email enviado)`),
};

const g = globalThis as unknown as { __slackHooks?: SlackHooks };

export function getSlackHooks(): SlackHooks {
  return (g.__slackHooks ??= { ...defaults });
}

export function setSlackHooks(hooks: Partial<SlackHooks>): void {
  g.__slackHooks = { ...getSlackHooks(), ...hooks };
}
