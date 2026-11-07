/**
 * Contratos do módulo de email. Independentes de `lib/contracts.ts` —
 * mudar aqui não afeta o resto do time.
 */
import { z } from "zod";
import { Report } from "@/lib/contracts";

const candidate = { candidateName: z.string(), to: z.string().email() };

export const InterviewInvitePayload = z.object({
  ...candidate,
  roleTitle: z.string(),
  /** ISO 8601, horário já no fuso que deve aparecer no email. */
  scheduledAt: z.string(),
  durationMin: z.number().int().positive().default(30),
  /** Link da sessão (sala da entrevista). */
  joinUrl: z.string().url(),
});
export type InterviewInvitePayload = z.infer<typeof InterviewInvitePayload>;

export const InterviewReschedulePayload = z.object({
  ...candidate,
  roleTitle: z.string(),
  previousScheduledAt: z.string().optional(),
  scheduledAt: z.string(),
  durationMin: z.number().int().positive().default(30),
  joinUrl: z.string().url(),
  reason: z.string().optional(),
});
export type InterviewReschedulePayload = z.infer<typeof InterviewReschedulePayload>;

export const InterviewFeedbackPayload = z.object({
  ...candidate,
  roleTitle: z.string(),
  report: Report,
});
export type InterviewFeedbackPayload = z.infer<typeof InterviewFeedbackPayload>;

export type EmailSendResult =
  | { status: "sent"; id: string }
  | { status: "simulated"; reason: string };
