import { after } from "next/server";
import { handleInteraction } from "@/lib/slack/interactions";
import { verifySlackSignature } from "@/lib/slack/verify";

export const runtime = "nodejs";

/** Endpoint de "Interactivity" do Slack App (cliques de botão e modais). */
export async function POST(req: Request) {
  // Body cru: a assinatura é calculada sobre ele.
  const raw = await req.text();
  const ok = verifySlackSignature(raw, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"));
  if (!ok) return new Response("assinatura inválida", { status: 401 });

  const payloadStr = new URLSearchParams(raw).get("payload");
  if (!payloadStr) return new Response("payload ausente", { status: 400 });

  try {
    await handleInteraction(JSON.parse(payloadStr), (fn) => after(fn));
  } catch (e) {
    console.error("[slack] interação falhou:", e);
  }
  // 200 vazio fecha o modal (view_submission) e confirma o clique.
  return new Response(null, { status: 200 });
}
