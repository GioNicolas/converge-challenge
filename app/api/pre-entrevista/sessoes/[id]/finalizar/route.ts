import { after, NextResponse } from "next/server";
import { z } from "zod";
import { paraInterviewConfig, Rascunho } from "@/lib/pre-entrevista/rascunho";
import { registrarEvento } from "@/lib/pre-entrevista/log";
import { aplicarPesosNaSessao, extrairSeAtrasada, salvarConfig, sincronizarSessao, substituirRascunho } from "@/lib/pre-entrevista/sessoes";
import { atualizarNaoAvaliado } from "@/lib/pre-entrevista/turno";
import { garantirQuestaoDaVaga, geraQuestao } from "@/lib/agente/kits/questao-da-vaga";
import { contexto } from "@/lib/agente/rotas/contexto";
import { comRegrasDaSquad } from "@/lib/squad-memory/config";
import { hidratarSquadMemory } from "@/lib/squad-memory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A questão do quadro é gerada depois da resposta (after); leva dezenas de segundos.
export const maxDuration = 300;

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

  // As regras ativas da vaga desta config vão junto (a entrevista recarrega as ativas quando começa).
  // Config nova é vaga nova: começa sem regras de outras vagas.
  await hidratarSquadMemory();
  resultado.config = comRegrasDaSquad(resultado.config);
  await salvarConfig(sessao, resultado.config);
  registrarEvento(sessao, {
    tipo: "finalizacao",
    resumo: `config ${resultado.config.id} salva (${resultado.config.criteria.length} critérios, ${resultado.config.durationMin} min)`,
    dados: { ok: true, config: resultado.config, rascunho: sessao.rascunho },
  });
  // System design: a questão do quadro é gerada para esta vaga em segundo plano. Quem entra no quadro antes de ela
  // ficar pronta espera por ela; só se falhar o quadro usa o problema fixo (ver `lib/agente/kits/questao-da-vaga.ts`).
  const config = resultado.config;
  const llm = contexto().llm;
  if (geraQuestao(config) && llm) {
    after(() => garantirQuestaoDaVaga(config, { llm }, { esperarMs: 280_000 }));
  }
  return NextResponse.json({ ok: true, config });
}
