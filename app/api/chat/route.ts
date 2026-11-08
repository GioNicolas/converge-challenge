import { after, NextResponse } from "next/server";
import { runAnalyst } from "@/lib/agents/analyst";
import { runInterviewerTurn } from "@/lib/agents/interviewer";
import { findBlipQuestion } from "@/lib/agents/policy";
import { ChatRequest } from "@/lib/contracts";
import { guardarSessao, sessaoViva } from "@/lib/session/persistencia";
import { appendEvent, latestCode, sessionNow } from "@/lib/session/store";

/** Teto do código aceito na conversa (o mesmo espírito do limite de snapshot). */
const MAX_CODE_CHARS = 100_000;

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
  // O contrato não carrega o código; ele vem à parte, validado aqui.
  const extra = (body ?? {}) as { code?: unknown; language?: unknown; reconheceu?: unknown };
  const liveCode = typeof extra.code === "string" && extra.code.length <= MAX_CODE_CHARS ? extra.code : undefined;
  const liveLanguage = typeof extra.language === "string" && extra.language.length > 0 && extra.language.length <= 40 ? extra.language : undefined;

  const session = await sessaoViva(sessionId);
  if (!session) {
    return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });
  }

  // Pergunta que esta instância não conhece (estado atrasado): a fala segue como fala livre, nunca como erro.
  // Um 404 aqui fazia a fala do candidato falhar e o Totti pedir para repetir a cada tentativa.
  const conhecida = blipId === undefined || !!findBlipQuestion(session, blipId);
  if (!conhecida) console.warn("[chat] pergunta desconhecida, seguindo como fala livre:", blipId);

  // Grava o código de agora antes do turno: o Totti nunca comenta uma versão velha.
  if (liveCode !== undefined && !session.ended && liveCode !== latestCode(session)) {
    appendEvent(session, {
      type: "snapshot",
      sessionId: session.sessionId,
      t: sessionNow(session),
      code: liveCode,
      version: (session.codeHistory.at(-1)?.version ?? 0) + 1,
      language: liveLanguage ?? session.language,
    });
  }

  const response = await runInterviewerTurn(session, { blipId: conhecida ? blipId : undefined, messages, reconheceu: extra.reconheceu === true });
  await guardarSessao(session);
  // Concluiu uma etapa: o analista olha o código agora (momento-chave), e a próxima pergunta já vem sobre o que segue.
  const gatilho = session.events.at(-1);
  if (response.concluded && gatilho) {
    after(() =>
      runAnalyst(session, gatilho)
        .catch((err) => console.error("[chat] analista falhou:", err))
        .then(() => guardarSessao(session)),
    );
  }
  return NextResponse.json(response);
}
