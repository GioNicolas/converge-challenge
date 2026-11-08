import { NextResponse } from "next/server";
import { z } from "zod";
import { classificarVaga } from "@/lib/pre-entrevista/classificador";
import { extrairCompetencias } from "@/lib/pre-entrevista/competencias";
import { criarSessao, estadoDaSessao } from "@/lib/pre-entrevista/sessoes";
import { abrirConversa } from "@/lib/pre-entrevista/turno";
import { regrasDaEmpresa } from "@/lib/squad-memory/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Corpo = z.object({
  roleTitle: z.string().trim().min(1, "cargo obrigatório"),
  jobDescription: z.string().trim().min(1, "descrição da vaga obrigatória"),
  context: z.string().trim().optional(),
});

/** Cria a sessão: classifica a vaga (Jev), monta o rascunho e registra a abertura do Totti. */
export async function POST(req: Request) {
  const lido = Corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) {
    return NextResponse.json(
      { erro: "dados inválidos", erros: lido.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`) },
      { status: 400 },
    );
  }

  const vaga = {
    roleTitle: lido.data.roleTitle,
    jobDescription: lido.data.jobDescription,
    ...(lido.data.context ? { context: lido.data.context } : {}),
  };
  const criadaEm = Date.now();
  let classificacao: Awaited<ReturnType<typeof classificarVaga>>;
  try {
    classificacao = await classificarVaga(vaga);
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error(`[pre-entrevista] classificação da vaga "${vaga.roleTitle}" falhou: ${mensagem}`);
    return NextResponse.json({ erro: "não consegui classificar a vaga", detalhe: mensagem }, { status: 502 });
  }

  // Competências da vaga: uma chamada rápida. Se falhar, a sessão segue sem elas (o log registra o motivo).
  const competencias = await extrairCompetencias(vaga);
  // O que o Totti já aprendeu com o Tech Lead desta empresa entra na conversa ("da última vez vocês pediram X").
  const sessao = criarSessao(vaga, classificacao, criadaEm, competencias, regrasDaEmpresa());
  abrirConversa(sessao);
  return NextResponse.json(estadoDaSessao(sessao), { status: 201 });
}
