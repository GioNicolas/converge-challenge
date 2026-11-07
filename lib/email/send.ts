import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { getResendClient } from "@/lib/email/resend-client";
import type { EmailSendResult } from "@/lib/email/types";

type SendArgs = {
  to: string;
  subject: string;
  template: ReactElement;
};

/**
 * Manda o email; se o Resend recusar (ex.: fora do destinatário permitido no
 * modo sandbox), não derruba o fluxo — loga o conteúdo e devolve "simulated"
 * pra UI seguir como se tivesse enviado. Isso é rede de segurança pra demo,
 * não solução de produção.
 */
export async function sendEmail({ to, subject, template }: SendArgs): Promise<EmailSendResult> {
  const html = await render(template);
  const from = process.env.EMAIL_FROM ?? "Converge Challenge <onboarding@resend.dev>";

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      // Sem isso alguns clientes ignoram o <meta charset> do HTML e
      // interpretam a mensagem como Latin-1, corrompendo os acentos.
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
    if (error) throw error;
    return { status: "sent", id: data!.id };
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
    console.error(`[email:fallback] envio real falhou (${reason}). Conteúdo simulado:`, {
      to,
      subject,
      html,
    });
    return { status: "simulated", reason };
  }
}
