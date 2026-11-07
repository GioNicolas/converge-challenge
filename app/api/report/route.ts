// STUB: a Pessoa B substitui por um avaliador com LLM. Aqui só monta um
// relatório válido a partir dos sinais reais da sessão (testes, dicas, colagens).
import { NextRequest, NextResponse } from "next/server";
import type { Report } from "@/lib/contracts";
import { getSession } from "@/lib/session/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSession(request.nextUrl.searchParams.get("sessionId") ?? "");
  if (!session) {
    return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });
  }

  const runs = session.events.filter((e) => e.type === "run");
  const lastRun = runs.at(-1);
  const testsPassed = lastRun?.result.passed ?? 0;
  const testsTotal = lastRun?.result.total ?? 0;
  const pastes = session.events.filter((e) => e.type === "paste").length;
  const ratio = testsTotal > 0 ? testsPassed / testsTotal : 0;
  const score = (base: number) => Math.min(4, Math.max(1, Math.round(base)));
  const lastT = session.events.at(-1)?.t ?? 0;

  const criteria = session.config.criteria.map((c) => ({
    id: c.id,
    name: c.name,
    score: score(c.id === "corretude" ? 1 + ratio * 3 : 2 + ratio),
    evidence: [{ t: lastT, text: "(stub) avaliação real vem do agente." }],
  }));
  const overall = criteria.reduce((a, c) => a + c.score, 0) / Math.max(1, criteria.length);

  const report: Report = {
    sessionId: session.sessionId,
    configId: session.config.id,
    roleTitle: session.config.roleTitle,
    recommendation: overall >= 3 ? "avancar" : overall >= 2 ? "talvez" : "nao_avancar",
    overallScore: Math.round(overall * 10) / 10,
    criteria,
    summary: `(stub) ${testsPassed}/${testsTotal} testes na última execução, ${runs.length} execuções, ${pastes} colagens e ${session.hintsUsed} dicas.`,
    strengths: testsPassed === testsTotal && testsTotal > 0 ? ["Passou em todos os testes visíveis."] : [],
    concerns: pastes > 0 ? ["Houve colagens de trechos grandes de código."] : [],
    nextSteps: ["Explorar complexidade e casos de borda na próxima etapa."],
    signals: { testsPassed, testsTotal, hintsUsed: session.hintsUsed, pastes, durationMs: lastT },
  };
  return NextResponse.json(report);
}
