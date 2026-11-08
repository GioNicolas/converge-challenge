// Só desenvolvimento: simula o Tech Lead decidindo (Aprovar/Reprovar com motivo), pelo mesmo caminho
// do clique de verdade (decisão registrada, extrator e regras guardadas). A tela /vagas/aprendizado usa no modo dev.
//   curl -X POST localhost:3000/api/squad-memory/simular -H "content-type: application/json" \
//     -d '{"decisao":"reprovado","motivo":"propôs Kafka sem necessidade para esse volume"}'
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Report } from "@/lib/contracts";
import { aprenderComDecisao } from "@/lib/squad-memory/aprender";
import { empresaAtual } from "@/lib/squad-memory/store";
import { visaoDaMemoria } from "@/lib/squad-memory/visao";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Pedido = z.object({
  decisao: z.enum(["aprovado", "reprovado"]),
  motivo: z.string().max(500).optional(),
  candidato: z.string().max(80).optional(),
  recomendacao: z.enum(["avancar", "talvez", "nao_avancar"]).optional(),
});

/** O candidato da demonstração: o Totti recomendou avançar (ainda não conhecia o time). */
const REPORT: Report = {
  sessionId: "demo-squad",
  configId: "demo-config",
  roleTitle: "Backend Pleno",
  recommendation: "avancar",
  overallScore: 3.2,
  criteria: [
    { id: "requisitos", name: "Requisitos e escopo", score: 3, evidence: [] },
    { id: "tradeoffs", name: "Trade-offs", score: 3, evidence: [] },
    { id: "estimativa", name: "Estimativa de escala", score: 2, evidence: [] },
  ],
  summary: "Desenhou o fluxo de pagamentos com fila Kafka entre a API e o processador (exemplo).",
  strengths: ["Fluxo claro"],
  concerns: ["Não estimou volume antes de escolher a fila"],
  nextSteps: [],
  signals: { testsPassed: 0, testsTotal: 0, hintsUsed: 0, pastes: 0, durationMs: 2_400_000 },
};

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response("não disponível", { status: 404 });
  const parsed = Pedido.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });
  const { decisao, motivo, candidato, recomendacao } = parsed.data;

  const report = { ...REPORT, recommendation: recomendacao ?? REPORT.recommendation };
  const aprendizado = await aprenderComDecisao({
    empresaId: empresaAtual(),
    vagaId: "demo-backend-pleno",
    vagaTitulo: "Backend Pleno",
    candidato: candidato || "Rafael Moura",
    decisao,
    motivo: motivo?.trim() || undefined,
    report,
  });
  return NextResponse.json({ aprendizado, memoria: visaoDaMemoria() });
}
