import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_HINT, findBlipQuestion } from "@/lib/agents/policy";
import type { BlipContext } from "@/lib/contracts";
import { getSession, latestCode, numberCode } from "@/lib/session/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });
  }

  const found = findBlipQuestion(session, id);
  if (!found) {
    return NextResponse.json({ error: "blip não encontrado" }, { status: 404 });
  }

  const elapsedS = Math.round((Date.now() - session.startedAt) / 1000);
  const runs = session.events.filter((e) => e.type === "run").length;
  const pastes = session.events.filter((e) => e.type === "paste").length;

  const context: BlipContext = {
    blip: found.blip,
    question: found.question.question,
    followUpTopic: found.question.followUpTopic,
    availableHint: AVAILABLE_HINT,
    numberedCode: numberCode(latestCode(session)),
    summary: `Candidato está há ${elapsedS}s na sessão, ${runs} execuções, ${pastes} colagens.`,
    focus: session.config.focus.map((f) => f.area),
  };
  return NextResponse.json(context);
}
