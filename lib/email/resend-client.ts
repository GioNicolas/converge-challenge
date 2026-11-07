import { Resend } from "resend";

let client: Resend | null = null;

/** Lazy: só exige RESEND_API_KEY quando alguém realmente manda um email. */
export function getResendClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada (.env)");
    client = new Resend(apiKey);
  }
  return client;
}
