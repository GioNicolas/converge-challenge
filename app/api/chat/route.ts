// STUB: será substituído pelo Interviewer com LLM.
import { NextResponse } from "next/server";
import { findBlipQuestion, nextHint } from "@/lib/agents/policy";
import { ChatRequest, type ChatResponse, type EditorCommand } from "@/lib/contracts";
import { appendEvent, getSession } from "@/lib/session/store";

export const dynamic = "force-dynamic";

const HINT_RE = /dica|ajuda|travado/i;
const ANSWER_RE = /resposta|solu[çc][ãa]o|mostra o c[óo]digo/i;
const REFUSAL =
  "Isso eu não posso fazer, a graça é ver como você pensa. Pra cada número, qual seria o par que você precisa encontrar?";

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

  const found = blipId ? findBlipQuestion(session, blipId) : undefined;
  if (blipId && !found) {
    return NextResponse.json({ error: "blip não encontrado" }, { status: 404 });
  }

  const agentTurns = messages.filter((m) => m.role === "agent").length;
  const lastCandidate = [...messages].reverse().find((m) => m.role === "candidate")?.text ?? "";
  const topic = found?.question.followUpTopic ?? "a sua solução";

  let response: ChatResponse;
  if (agentTurns === 0 && found) {
    const highlight = found.question.highlight;
    const commands: EditorCommand[] = highlight
      ? [{ type: "highlight_range", startLine: highlight.startLine, endLine: highlight.endLine }]
      : [];
    response = { reply: found.question.question, commands, end: false };
  } else if (agentTurns === 0 && !lastCandidate) {
    // Candidato chamou o entrevistador sem blip.
    response = { reply: "Oi! Pode falar, no que posso te ajudar?", commands: [], end: false };
  } else if (ANSWER_RE.test(lastCandidate)) {
    response = { reply: REFUSAL, commands: [], end: false };
  } else if (HINT_RE.test(lastCandidate)) {
    const hint = nextHint(session);
    if (hint) {
      appendEvent(session, {
        type: "hint",
        sessionId,
        t: Date.now() - session.startedAt,
        level: session.hintsUsed + 1,
        text: hint,
      });
      response = { reply: hint, commands: [], end: false };
    } else {
      response = {
        reply: "Já te dei as dicas que eu tinha. Tenta me explicar onde você travou?",
        commands: [],
        end: false,
      };
    }
  } else if (agentTurns + 1 >= 3) {
    response = {
      reply: "Beleza, obrigado! Pode seguir.",
      commands: [{ type: "clear_highlights" }],
      end: true,
    };
  } else {
    response = {
      reply: `Entendi. E sobre ${topic}, você pode me falar um pouco mais?`,
      commands: [],
      end: false,
    };
  }

  return NextResponse.json(response);
}
