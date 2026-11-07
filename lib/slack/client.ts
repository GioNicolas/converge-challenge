/**
 * Cliente mínimo da Web API do Slack. Sem SLACK_BOT_TOKEN entra em modo
 * simulado: loga a chamada e devolve um ts falso (mesma ideia do email).
 */
export type SlackResult = { ok: boolean; ts?: string; channel?: string; error?: string; simulated?: boolean };

export function isSimulated(): boolean {
  return !process.env.SLACK_BOT_TOKEN;
}

export async function slackApi(method: string, body: Record<string, unknown>): Promise<SlackResult> {
  if (isSimulated()) {
    console.info(`[slack:simulado] ${method}`, JSON.stringify(body).slice(0, 400));
    return { ok: true, simulated: true, ts: `${Date.now() / 1000}`, channel: String(body.channel ?? "") };
  }
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as SlackResult;
  if (!data.ok) console.error(`[slack] ${method} falhou:`, data.error);
  return data;
}
