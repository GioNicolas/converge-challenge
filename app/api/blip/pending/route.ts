/**
 * GET /api/blip/pending?sessionId=... — a IDE faz polling a cada ~3 s, pra o blip aparecer
 * mesmo com o candidato parado (sem evento novo, POST /api/events não responde nada).
 * decideBlip só levanta blip com o candidato parado e a sessão ativa (regra fica lá dentro).
 */
import { NextRequest, NextResponse } from "next/server";
import { decideBlip } from "@/lib/agents/policy";
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
  const blip = decideBlip(session, t);
  const response: EventsResponse = blip ? { blip } : {};
  return NextResponse.json(response);
}
