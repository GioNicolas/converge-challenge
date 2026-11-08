import { NextResponse } from "next/server";
import { estadoDaSessao, getSessao, sincronizarSessao } from "@/lib/pre-entrevista/sessoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado completo da sessão: vaga, transcrição, rascunho, cobertura, status, logs e config final. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = getSessao(id);
  if (!sessao) return NextResponse.json({ erro: "sessão não encontrada" }, { status: 404 });
  return NextResponse.json(estadoDaSessao(sessao));
}

/**
 * Mesmo estado do GET, mas com a `copia` que a tela guardou no corpo: se esta instância do servidor
 * não tem a sessão (ou tem uma versão mais velha), ela é reconstruída a partir da cópia.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as { copia?: unknown } | null;
  const sessao = sincronizarSessao(id, corpo?.copia);
  if (!sessao) return NextResponse.json({ erro: "sessão não encontrada" }, { status: 404 });
  return NextResponse.json(estadoDaSessao(sessao));
}
