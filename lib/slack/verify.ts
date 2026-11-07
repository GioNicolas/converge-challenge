import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida X-Slack-Signature sobre o body CRU. Sem SLACK_SIGNING_SECRET só passa
 * fora de produção (para testar com curl local).
 */
export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
