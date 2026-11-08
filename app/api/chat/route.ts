import { NextResponse } from "next/server";
import { runInterviewerTurn } from "@/lib/agents/interviewer";
import { findBlipQuestion } from "@/lib/agents/policy";
import { ChatRequest } from "@/lib/contracts";
import { guardarSessao, sessaoViva } from "@/lib/session/persistencia";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = ChatRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sessionId, blipId, messages } = parsed.data;

  const session = await sessaoViva(sessionId);
  if (!session) {
    return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });
  }

  if (blipId !== undefined && !findBlipQuestion(session, blipId)) {
    return NextResponse.json({ error: "blip não encontrado" }, { status: 404 });
  }

  const response = await runInterviewerTurn(session, { blipId, messages });
  await guardarSessao(session);
  return NextResponse.json(response);
}
