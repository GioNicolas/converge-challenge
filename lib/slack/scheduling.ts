/**
 * Plano aprovado -> agenda real com os candidatos da vaga, respeitando
 * horário comercial e sem colidir com entrevistas já marcadas de outras
 * vagas (ver `availability.ts`).
 */
import { CANDIDATES } from "@/lib/hiring/mocks/candidates";
import { sendInterviewInvite } from "@/lib/email";
import { createCandidateSession } from "./session-link";
import { reserveSlot } from "./availability";
import type { StoredPlan } from "./types";

const DEFAULT_DURATION_MIN = 45;
const BUFFER_MIN = 15;

function totalDurationMin(plan: StoredPlan): number {
  const minutes = plan.plan.stages.reduce((sum, s) => sum + s.minutes, 0);
  return minutes > 0 ? minutes : DEFAULT_DURATION_MIN;
}

/** Agora, mais 24h — ponto de partida pra achar o primeiro horário comercial livre. */
function earliestStart(): Date {
  return new Date(Date.now() + 24 * 60 * 60_000);
}

/**
 * Plano aprovado: reserva um horário comercial livre por candidato da vaga
 * (sequencial, pra não disputar o mesmo slot entre si nem com outras vagas)
 * e dispara o convite por email em paralelo. Candidato sem email mandado
 * não derruba os outros; sem candidatos, só avisa e sai.
 */
export async function scheduleInterviewsForPlan(plan: StoredPlan): Promise<void> {
  const candidates = CANDIDATES.filter((c) => c.jobPostingId === plan.planId);
  if (candidates.length === 0) {
    console.warn(`[slack:scheduling] nenhum candidato encontrado para a vaga ${plan.planId}`);
    return;
  }

  const durationMin = totalDurationMin(plan);
  let nextFrom = earliestStart();

  const bookings = candidates.map((candidate) => {
    const slot = reserveSlot(durationMin, nextFrom);
    // Próximo candidato só pode começar depois deste + buffer, mesmo que o
    // slot dele tenha sido empurrado por conflito.
    nextFrom = new Date(slot.getTime() + (durationMin + BUFFER_MIN) * 60_000);
    return { candidate, scheduledAt: slot.toISOString() };
  });

  await Promise.all(
    bookings.map(async ({ candidate, scheduledAt }) => {
      try {
        const { url } = createCandidateSession(candidate.id, plan.planId);
        await sendInterviewInvite({
          candidateName: candidate.name,
          to: candidate.email,
          roleTitle: plan.jobTitle,
          scheduledAt,
          durationMin,
          joinUrl: url,
        });
      } catch (err) {
        console.error(`[slack:scheduling] falha ao agendar/enviar convite para ${candidate.id}:`, err);
      }
    }),
  );
}
