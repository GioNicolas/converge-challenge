import { NextResponse } from "next/server";
import { runAnalyst } from "@/lib/agents/analyst";
import { decideBlip } from "@/lib/agents/policy";
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

  const session = getOrCreateSession(event.sessionId);
  appendEvent(session, event);
  if (ANALYZED_TRIGGERS.has(event.type)) {
    try {
      await runAnalyst(session, event);
    } catch (err) {
      // Falha do analista não derruba a entrevista: o erro já fica em analyst.lastError.
      console.error("[events] analista falhou:", err);
    }
  }

  const blip = decideBlip(session, event);
  const response: EventsResponse = blip ? { blip } : {};
  return NextResponse.json(response);
}
