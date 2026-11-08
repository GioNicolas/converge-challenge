/**
 * POST /api/dev/empecilho { sessionId } — só fora de produção. Solta o empecilho da questão agora, sem esperar
 * as regras de tempo (para testar e para a demo). A IDE recebe o balão como se viesse do polling.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { forceEmpecilho } from "@/lib/agents/policy";
import type { EventsResponse } from "@/lib/contracts";
import { getSession, sessionNow } from "@/lib/session/store";

export const dynamic = "force-dynamic";

const Body = z.object({ sessionId: z.string() });

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "indisponível" }, { status: 404 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const session = getSession(parsed.data.sessionId);
  if (!session) return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });

  const { blip, dismissBlipId, reason } = forceEmpecilho(session, sessionNow(session));
  const response: EventsResponse & { reason: string } = { blip, dismissBlipId, reason };
  return NextResponse.json(response);
}
