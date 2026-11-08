// Relatório final para a recrutadora. A avaliação começa no session_ended (lib/agents/evaluator.ts);
// aqui só se consulta o resultado.
import { NextRequest, NextResponse } from "next/server";
import { candidatosPorSessao } from "@/lib/convites/store";
import type { Report } from "@/lib/contracts";
import { startEvaluation } from "@/lib/agents/evaluator";
import { exemploHabilitado, relatorioExemplo } from "@/lib/session/relatorio-exemplo";
import { findReport, listReports } from "@/lib/session/reports";
import { getSession, listSessions } from "@/lib/session/store";

export const dynamic = "force-dynamic";

/** Item da lista de sessões (GET /api/report sem sessionId). */
export interface ReportListItem {
  sessionId: string;
  /** Config da vaga: é por ela que o painel da vaga acha as entrevistas feitas pelo link. */
  configId: string;
  roleTitle: string;
  startedAt: number;
  ended: boolean;
  state?: "running" | "done" | "error";
  overallScore?: number;
  recommendation?: Report["recommendation"];
  /** Nome do candidato, quando a entrevista foi aberta pelo link do convite. */
  candidato?: string;
}

/**
 * GET /api/report?sessionId=...
 * - 200: o `Report`
 * - 202: { status: "gerando" } — a página consulta de novo em instantes
 * - 409: sessão ainda em andamento; 404: não encontrada; 500: { error } (`&retry=1` tenta de novo)
 * Sem sessionId: lista as sessões em memória, para a recrutadora escolher.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sessionId = params.get("sessionId");
  if (!sessionId) {
    const items: ReportListItem[] = listSessions().map((s) => ({
      sessionId: s.sessionId,
      configId: s.config.id,
      roleTitle: s.config.roleTitle,
      startedAt: s.startedAt,
      ended: s.ended,
      state: s.report?.state,
      overallScore: s.report?.report?.overallScore,
      recommendation: s.report?.report?.recommendation,
    }));
    // Relatórios de sessões que já saíram da memória (o servidor reiniciou).
    const emMemoria = new Set(items.map((i) => i.sessionId));
    for (const { startedAt, report } of await listReports()) {
      if (emMemoria.has(report.sessionId)) continue;
      items.push({
        sessionId: report.sessionId,
        configId: report.configId,
        roleTitle: report.roleTitle,
        startedAt,
        ended: true,
        state: "done",
        overallScore: report.overallScore,
        recommendation: report.recommendation,
      });
    }
    const nomes = await candidatosPorSessao();
    for (const item of items) item.candidato = nomes.get(item.sessionId);
    return NextResponse.json(items.sort((a, b) => b.startedAt - a.startedAt));
  }

  // Exemplo de dev (`/report?sessionId=exemplo`): abre o relatório sem fazer uma entrevista.
  if (exemploHabilitado(sessionId)) return NextResponse.json(relatorioExemplo());

  const session = getSession(sessionId);
  if (!session) {
    const salvo = await findReport(sessionId);
    if (salvo) return NextResponse.json(salvo.report);
    return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });
  }
  if (!session.ended) {
    return NextResponse.json({ error: "a entrevista ainda está em andamento" }, { status: 409 });
  }

  const status = startEvaluation(session, { retry: params.get("retry") === "1" });
  if (status.state === "running") return NextResponse.json({ status: "gerando" }, { status: 202 });
  if (status.state === "error") return NextResponse.json({ error: status.error }, { status: 500 });
  return NextResponse.json(status.report);
}
