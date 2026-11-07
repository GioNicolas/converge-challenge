import { NextResponse } from "next/server";
import { z } from "zod";
import { ErroChat } from "@/lib/pre-entrevista/llm";
import { responder } from "@/lib/pre-entrevista/conversa";
import { registrarEvento } from "@/lib/pre-entrevista/log";
import {
  agendarExtracao,
  desfazerUltimaFala,
  estadoDaSessao,
  getSessao,
  liberar,
  ocupar,
  registrarFala,
} from "@/lib/pre-entrevista/sessoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Corpo = z.object({ text: z.string().trim().min(1, "fala vazia").max(2000, "fala longa demais") });

/**
 * Fala da recrutadora. Ordem: registra a fala, gera a resposta da Nara, grava a resposta e só então
 * agenda a extração em segundo plano. Se a Nara falhar, a fala sai da transcrição e volta 502,
 * para a recrutadora reenviar sem duplicar nada.
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
    return NextResponse.json({ erro: "a Nara ainda está respondendo a fala anterior" }, { status: 409 });
  }
  try {
    const texto = lido.data.text;
    registrarFala(sessao, { role: "recrutadora", text: texto });

    let resposta: Awaited<ReturnType<typeof responder>>;
    try {
      resposta = await responder(sessao);
    } catch (err) {
      desfazerUltimaFala(sessao);
      const mensagem = err instanceof Error ? err.message : String(err);
      registrarEvento(sessao, {
        tipo: "erro",
        nivel: "erro",
        resumo: `resposta da Nara falhou; fala desfeita: ${mensagem}`,
        dados: {
          etapa: "conversa",
          textoNaoRespondido: texto,
          mensagem,
          ...(err instanceof ErroChat ? { tentativas: err.tentativas } : {}),
        },
      });
      return NextResponse.json(
        { erro: "a Nara não respondeu; envie a fala de novo", detalhe: mensagem, estado: estadoDaSessao(sessao) },
        { status: 502 },
      );
    }

    registrarFala(
      sessao,
      { role: "agente", text: resposta.texto },
      {
        ms: resposta.ms,
        provedor: resposta.provedor,
        model: resposta.model,
        fallback: resposta.fallback,
        dados: {
          mensagens: resposta.mensagens,
          respostaCrua: resposta.respostaCrua,
          tentativas: resposta.tentativas,
        },
      },
    );
    agendarExtracao(sessao);
    return NextResponse.json(estadoDaSessao(sessao));
  } finally {
    liberar(id);
  }
}
