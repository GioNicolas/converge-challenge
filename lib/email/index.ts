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
    subject: `Feedback da sua entrevista — ${payload.roleTitle}`,
    template: InterviewFeedbackEmail(payload),
    templateName: "feedback",
  });
}

export async function sendTriagemConvite(input: unknown): Promise<EmailSendResult> {
  const payload = TriagemConvitePayload.parse(input);
  return sendEmail({
    to: payload.to,
    subject: `Você avançou para a triagem técnica: ${payload.roleTitle}`,
    template: TriagemConviteEmail(payload),
    templateName: "triagem",
  });
}

export * from "@/lib/email/types";
