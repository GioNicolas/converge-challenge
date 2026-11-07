import { NextResponse } from "next/server";
import { z } from "zod";
import { agendarExtracao, estadoDaSessao, getSessao, liberar, ocupar } from "@/lib/pre-entrevista/sessoes";
import { conduzirTurno } from "@/lib/pre-entrevista/turno";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Corpo = z.object({ text: z.string().trim().min(1, "fala vazia").max(2000, "fala longa demais") });

/**
 * Fala da recrutadora. O turno (`conduzirTurno`) registra a fala, mede a cobertura, escolhe o passo e
 * gera a fala do Totti. Só então agenda a extração em segundo plano. Se o Totti falhar, a fala sai da
 * transcrição e volta 502, para a recrutadora reenviar sem duplicar nada.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = getSessao(id);
  if (!sessao) return NextResponse.json({ erro: "sessão não encontrada" }, { status: 404 });

  const lido = Corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) {
    return NextResponse.json({ erro: "dados inválidos", erros: lido.error.issues.map((i) => i.message) }, { status: 400 });
  }

  if (!ocupar(id)) {
    return NextResponse.json({ erro: "o Totti ainda está respondendo a fala anterior" }, { status: 409 });
  }
  try {
    try {
      await conduzirTurno(sessao, lido.data.text);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { erro: "o Totti não respondeu; envie a fala de novo", detalhe: mensagem, estado: estadoDaSessao(sessao) },
        { status: 502 },
      );
    }
    agendarExtracao(sessao);
    return NextResponse.json(estadoDaSessao(sessao));
  } finally {
    liberar(id);
  }
}
