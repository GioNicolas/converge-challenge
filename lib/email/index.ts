import { createElement } from "react";
import { firstName } from "@/lib/email/format";
import { sendEmail } from "@/lib/email/send";
import { InterviewInviteEmail } from "@/lib/email/templates/InterviewInvite";
import { InterviewRescheduleEmail } from "@/lib/email/templates/InterviewReschedule";
import { InterviewFeedbackEmail } from "@/lib/email/templates/InterviewFeedback";
import { TriagemConviteEmail } from "@/lib/email/templates/TriagemConvite";
import {
  InterviewInvitePayload,
  InterviewReschedulePayload,
  InterviewFeedbackPayload,
  TriagemConvitePayload,
} from "@/lib/email/types";
import type { EmailSendResult } from "@/lib/email/types";

export function triagemConviteSubject(roleTitle: string, candidateName?: string): string {
  const nome = candidateName ? firstName(candidateName) : "";
  return nome ? `${nome}, vamos marcar sua entrevista para ${roleTitle}` : `Sua entrevista para ${roleTitle}`;
}

export async function sendInterviewInvite(input: unknown): Promise<EmailSendResult> {
  const payload = InterviewInvitePayload.parse(input);
  return sendEmail({
    to: payload.to,
    subject: `Entrevista marcada: ${payload.roleTitle}`,
    template: InterviewInviteEmail(payload),
    templateName: "invite",
  });
}

export async function sendInterviewReschedule(input: unknown): Promise<EmailSendResult> {
  const payload = InterviewReschedulePayload.parse(input);
  return sendEmail({
    to: payload.to,
    subject: `Entrevista remarcada: ${payload.roleTitle}`,
    template: InterviewRescheduleEmail(payload),
    templateName: "reschedule",
  });
}

export async function sendInterviewFeedback(input: unknown): Promise<EmailSendResult> {
  const payload = InterviewFeedbackPayload.parse(input);
  return sendEmail({
    to: payload.to,
    subject: `Sobre sua entrevista para ${payload.roleTitle}`,
    template: InterviewFeedbackEmail(payload),
    templateName: "feedback",
  });
}

export async function sendTriagemConvite(input: unknown, recruiterName?: string): Promise<EmailSendResult> {
  const payload = TriagemConvitePayload.parse(input);
  const nomeRecrutadora = recruiterName?.trim();
  return sendEmail({
    to: payload.to,
    subject: triagemConviteSubject(payload.roleTitle, payload.candidateName),
    fromDisplayName: nomeRecrutadora ? `${nomeRecrutadora}, do time de recrutamento` : undefined,
    template: createElement(TriagemConviteEmail, { ...payload, recruiterName: nomeRecrutadora }),
    templateName: "triagem",
  });
}

export * from "@/lib/email/types";
