import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { vincularSessao } from "@/lib/convites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ convite: z.string().max(40), sessionId: z.string().max(80) });

/**
 * A IDE avisa que a sessão `sessionId` foi aberta pelo link do convite. Fica fora do /api/events de
 * propósito: o contrato de eventos e os agentes não precisam saber de convite.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  const ok = await vincularSessao(parsed.data.convite, parsed.data.sessionId);
  return ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ erro: "convite não encontrado" }, { status: 404 });
}
