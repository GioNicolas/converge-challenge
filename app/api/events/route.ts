import { NextResponse } from "next/server";
import { runAnalyst } from "@/lib/agents/analyst";
import { startEvaluation } from "@/lib/agents/evaluator";
import { decideBlip, enqueueKickoff } from "@/lib/agents/policy";
import { resolveConfig } from "@/lib/config/store";
import { EventsResponse, SessionEvent } from "@/lib/contracts";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";

export const dynamic = "force-dynamic";

// A conversa conta como gatilho quando termina (blip_closed), não a cada fala.
const ANALYZED_TRIGGERS = new Set<SessionEvent["type"]>(["pause", "run", "paste", "blip_closed"]);

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = SessionEvent.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const event = parsed.data;

  // A sessão nasce com a config da vaga (saída da pré-entrevista), achada pelo configId do session_started.
  const config = event.type === "session_started" ? await resolveConfig(event.configId) : undefined;
  const session = getOrCreateSession(event.sessionId, config);
  appendEvent(session, event);
  if (event.type === "session_started") enqueueKickoff(session, event.t);
  // A avaliação leva de 15 s a 1 min: começa já, em segundo plano, e o GET /api/report busca o resultado.
  if (event.type === "session_ended") startEvaluation(session);
  if (ANALYZED_TRIGGERS.has(event.type)) {
    try {
      await runAnalyst(session, event);
    } catch (err) {
      // Falha do analista não derruba a entrevista: o erro já fica em analyst.lastError.
      console.error("[events] analista falhou:", err);
    }
  }

  const { blip, dismissBlipId } = decideBlip(session, event.t);
  const response: EventsResponse = { blip, dismissBlipId };
  return NextResponse.json(response);
}
