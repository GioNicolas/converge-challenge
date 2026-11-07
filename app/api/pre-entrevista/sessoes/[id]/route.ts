import { NextResponse } from "next/server";
import { estadoDaSessao, getSessao } from "@/lib/pre-entrevista/sessoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado completo da sessão: vaga, transcrição, rascunho, cobertura, status, logs e config final. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = getSessao(id);
  if (!sessao) return NextResponse.json({ erro: "sessão não encontrada" }, { status: 404 });
  return NextResponse.json(estadoDaSessao(sessao));
}
