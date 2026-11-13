import { NextResponse } from "next/server";
import { z } from "zod";
import { Rascunho } from "@/lib/pre-entrevista/rascunho";
import { estadoDaSessao, salvarRevisao, sincronizarSessao } from "@/lib/pre-entrevista/sessoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `copia`: a sessão como a tela a guardou, para reconstruir se esta instância não a tiver (ver `sincronizarSessao`).
const Corpo = z.object({ rascunho: Rascunho, copia: z.unknown().optional() });

/**
 * Guarda o rascunho editado na revisão quando ela volta à conversa, sem gerar config. O que mudou fica fixado: a
 * extração e os pesos não o sobrescrevem até ela falar daquele campo de novo (ver `lib/pre-entrevista/fixados.ts`).
 * Responde com o estado da sessão, para a tela guardar a cópia nova.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo não é JSON válido" }, { status: 400 });
  }
  const sessao = sincronizarSessao(id, (bruto as { copia?: unknown } | null)?.copia);
  if (!sessao) return NextResponse.json({ erro: "sessão não encontrada" }, { status: 404 });
  const lido = Corpo.safeParse(bruto);
  if (!lido.success) {
    const erros = lido.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
    return NextResponse.json({ ok: false, erros }, { status: 422 });
  }
  const fixados = salvarRevisao(sessao, lido.data.rascunho);
  return NextResponse.json({ ok: true, fixados, estado: estadoDaSessao(sessao) });
}
