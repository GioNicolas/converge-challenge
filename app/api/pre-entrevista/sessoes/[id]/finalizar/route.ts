import { NextResponse } from "next/server";
import { z } from "zod";
import { paraInterviewConfig, Rascunho } from "@/lib/pre-entrevista/rascunho";
import { registrarEvento } from "@/lib/pre-entrevista/log";
import { aplicarPesosNaSessao, extrairSeAtrasada, salvarConfig, sincronizarSessao, substituirRascunho } from "@/lib/pre-entrevista/sessoes";
import { atualizarNaoAvaliado } from "@/lib/pre-entrevista/turno";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `copia`: a sessão como a tela a guardou, para reconstruir se esta instância não a tiver (ver `sincronizarSessao`).
const Corpo = z.object({ rascunho: Rascunho.optional(), copia: z.unknown().optional() });

/**
 * Gera o InterviewConfig a partir do rascunho. Se vier `rascunho` no corpo, é a versão revisada
 * à mão e substitui o da sessão (com diff no log). Espera a extração em curso terminar antes (e a refaz
 * se ela não acompanhou a última fala, como numa sessão reconstruída da cópia).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const texto = await req.text();
  let bruto: unknown = {};
  if (texto.trim()) {
    try {
      bruto = JSON.parse(texto);
    } catch {
      return NextResponse.json({ erro: "corpo não é JSON válido" }, { status: 400 });
    }
  }
  const lido = Corpo.safeParse(bruto);
  // A cópia vale mesmo com a revisão inválida: o 422 precisa da sessão para registrar o erro.
  const sessao = sincronizarSessao(id, (bruto as { copia?: unknown } | null)?.copia);
  if (!sessao) return NextResponse.json({ erro: "sessão não encontrada" }, { status: 404 });
  if (!lido.success) {
    const erros = lido.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
    registrarEvento(sessao, {
      tipo: "finalizacao",
      nivel: "aviso",
      resumo: `revisão inválida: ${erros.length} erro(s)`,
      dados: { ok: false, erros },
    });
    return NextResponse.json({ ok: false, erros }, { status: 422 });
  }

  await extrairSeAtrasada(sessao);
  if (lido.data.rascunho) substituirRascunho(sessao, lido.data.rascunho, "revisão manual");

  atualizarNaoAvaliado(sessao);
  // Na finalização, o foco e o guia saem do estado (ênfase, falas, decisões), não da revisão à mão.
  aplicarPesosNaSessao(sessao, "finalização");
  const resultado = paraInterviewConfig(sessao.rascunho, sessao.preferencias, sessao.naoAvaliado);
  if (!resultado.ok) {
    registrarEvento(sessao, {
      tipo: "finalizacao",
      nivel: "aviso",
      resumo: `recusada: ${resultado.erros.length} erro(s)`,
      dados: { ok: false, erros: resultado.erros, rascunho: sessao.rascunho },
    });
    return NextResponse.json({ ok: false, erros: resultado.erros }, { status: 422 });
  }

  await salvarConfig(sessao, resultado.config);
  registrarEvento(sessao, {
    tipo: "finalizacao",
    resumo: `config ${resultado.config.id} salva (${resultado.config.criteria.length} critérios, ${resultado.config.durationMin} min)`,
    dados: { ok: true, config: resultado.config, rascunho: sessao.rascunho },
  });
  return NextResponse.json({ ok: true, config: resultado.config });
}
