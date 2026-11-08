import { after, NextResponse } from "next/server";
import { runAnalyst } from "@/lib/agents/analyst";
import { runInterviewerTurn } from "@/lib/agents/interviewer";
import { findBlipQuestion } from "@/lib/agents/policy";
import { ChatRequest } from "@/lib/contracts";
import { getSession } from "@/lib/session/store";

export const dynamic = "force-dynamic";
// Depois de uma etapa concluída, o analista roda em segundo plano (after) e pode levar alguns segundos.
export const maxDuration = 60;

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = ChatRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sessionId, blipId, messages } = parsed.data;

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });
  }

  if (blipId !== undefined && !findBlipQuestion(session, blipId)) {
    return NextResponse.json({ error: "blip não encontrado" }, { status: 404 });
  }

  const response = await runInterviewerTurn(session, { blipId, messages });
  // Concluiu uma etapa: o analista olha o código agora (momento-chave), e a próxima pergunta já vem sobre o que segue.
  const gatilho = session.events.at(-1);
  if (response.concluded && gatilho) {
    after(() => runAnalyst(session, gatilho).catch((err) => console.error("[chat] analista falhou:", err)));
  }
  return NextResponse.json(response);
}
