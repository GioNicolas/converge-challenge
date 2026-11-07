/**
 * Contratos do módulo de email. Independentes de `lib/contracts.ts` —
 * mudar aqui não afeta o resto do time.
 */
import { z } from "zod";

const candidate = {
  candidateName: z.string().trim().min(1).max(120),
  to: z.string().email().max(254),
};
const roleTitle = z.string().trim().min(1).max(160);
/** ISO 8601 com offset (ex.: 2026-05-10T14:00:00-03:00 ou ...Z). */
const isoDateTime = z.string().datetime({ offset: true });

export const InterviewInvitePayload = z.object({
  ...candidate,
  roleTitle,
  scheduledAt: isoDateTime,
  durationMin: z.number().int().positive().max(480).default(30),
  /** Link da sessão (sala da entrevista). */
  joinUrl: z.string().url().max(2048),
});
export type InterviewInvitePayload = z.infer<typeof InterviewInvitePayload>;

export const InterviewReschedulePayload = z.object({
  ...candidate,
  roleTitle,
  previousScheduledAt: isoDateTime.optional(),
  scheduledAt: isoDateTime,
  durationMin: z.number().int().positive().max(480).default(30),
  joinUrl: z.string().url().max(2048),
  reason: z.string().trim().max(500).optional(),
});
export type InterviewReschedulePayload = z.infer<typeof InterviewReschedulePayload>;

/**
 * O email de feedback vai pro CANDIDATO: só carrega a recomendação, que define
 * a mensagem. Conteúdo interno do relatório (concerns, nextSteps, resumo da IA)
 * nunca é enviado nem renderizado.
 */
export const InterviewFeedbackPayload = z.object({
  ...candidate,
  roleTitle,
  recommendation: z.enum(["avancar", "talvez", "nao_avancar"]),
});
export type InterviewFeedbackPayload = z.infer<typeof InterviewFeedbackPayload>;

export type EmailSendResult =
  | { status: "sent"; id: string }
  | { status: "simulated"; reason: string };

/**
 * Convite pra triagem técnica (pré-entrevista aprovada). O email NÃO carrega o problema,
 * os critérios nem o foco: só o formato, a duração e o link pra escolher o horário.
 */
export const TriagemConvitePayload = z.object({
  ...candidate,
  roleTitle,
  mode: z.enum(["live_coding", "system_design"]),
  durationMin: z.number().int().positive().max(480),
  languages: z.array(z.string()).default([]),
  /** Página pública de agendamento (link pessoal do candidato). */
  scheduleUrl: z.string().url().max(2048),
});
export type TriagemConvitePayload = z.infer<typeof TriagemConvitePayload>;
