/**
 * POST /api/encerramento { sessionId } — o candidato confirmou que quer finalizar. Se o agente ainda tem o que
 * perguntar, devolve o balão da última conversa (a IDE abre direto e só encerra quando ela fecha); senão,
 * `{}` e a IDE encerra na hora.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { startClosing } from "@/lib/agents/policy";
import type { EventsResponse } from "@/lib/contracts";
import { sessionNow } from "@/lib/session/store";
import { guardarSessao, sessaoViva } from "@/lib/session/persistencia";

export const dynamic = "force-dynamic";

const Body = z.object({ sessionId: z.string() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const session = await sessaoViva(parsed.data.sessionId);
  if (!session) return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });

  const response: EventsResponse = { blip: startClosing(session, sessionNow(session)) };
  await guardarSessao(session);
  return NextResponse.json(response);
}
