/**
 * GET /api/blip/pending?sessionId=... — a IDE faz polling a cada ~3 s, pra o blip aparecer
 * mesmo com o candidato parado (sem evento novo, POST /api/events não responde nada).
 * Só devolve blip quando o candidato está parado (isCandidateIdle) e a sessão não acabou.
 */
import { NextRequest, NextResponse } from "next/server";
import { decideBlip, isCandidateIdle } from "@/lib/agents/policy";
import type { EventsResponse } from "@/lib/contracts";
import { getSession } from "@/lib/session/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });
  }

  const t = Date.now() - session.startedAt;
  const blip = !session.ended && isCandidateIdle(session, t) ? decideBlip(session, t) : undefined;
  const response: EventsResponse = blip ? { blip } : {};
  return NextResponse.json(response);
}
