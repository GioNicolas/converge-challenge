import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { getResendClient } from "@/lib/email/resend-client";
import type { EmailSendResult } from "@/lib/email/types";

type SendArgs = {
  to: string;
  subject: string;
  template: ReactElement;
  /** Nome do template, só pra log (sem PII). */
  templateName?: string;
};

/** Falha real de envio/renderização; as rotas traduzem pra 502. */
export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Manda o email. Só simula (sem enviar) quando RESEND_API_KEY não está
 * configurada E NODE_ENV !== "production". Qualquer outra falha vira
 * EmailDeliveryError. Logs trazem só metadados — nunca o HTML (PII).
 */
export async function sendEmail({
  to,
  subject,
  template,
  templateName = "unknown",
}: SendArgs): Promise<EmailSendResult> {
  const from = process.env.EMAIL_FROM ?? "Converge Challenge <onboarding@resend.dev>";
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;
  const domain = to.split("@")[1] ?? "?";

  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
    console.warn(`[email:simulated] template=${templateName} dominio=${domain} (RESEND_API_KEY ausente)`);
    return { status: "simulated", reason: "RESEND_API_KEY não configurada" };
  }

  try {
    const [html, text] = await Promise.all([render(template), render(template, { plainText: true })]);
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({ from, to, subject, html, text, replyTo });
    if (error) throw error;
    return { status: "sent", id: data!.id };
  } catch (err) {
    const reason = errorMessage(err);
    console.error(`[email:error] template=${templateName} dominio=${domain} erro=${reason}`);
    throw new EmailDeliveryError(reason);
  }
}
