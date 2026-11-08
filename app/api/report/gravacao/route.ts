/**
 * GET /api/report/gravacao?sessionId=... — a gravação da sessão (código, falas, execuções e marcos) para o
 * relatório mostrar cada prova no minuto em que aconteceu. Vem da sessão em memória ou, depois de um
 * restart, do que ficou salvo em disco com o relatório. 404 se não houver nenhum dos dois.
 */
import { NextRequest, NextResponse } from "next/server";
import { gravacaoDaSessao } from "@/lib/session/gravacao";
import { exemploHabilitado, GRAVACAO_EXEMPLO } from "@/lib/session/relatorio-exemplo";
import { findReport } from "@/lib/session/reports";
import { sessaoViva } from "@/lib/session/persistencia";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  if (exemploHabilitado(sessionId)) return NextResponse.json(GRAVACAO_EXEMPLO);
  const session = await sessaoViva(sessionId);
  if (session) return NextResponse.json(gravacaoDaSessao(session));

  const salvo = await findReport(sessionId);
  if (salvo?.gravacao) return NextResponse.json(salvo.gravacao);
  return NextResponse.json({ error: "gravação não encontrada" }, { status: 404 });
}
