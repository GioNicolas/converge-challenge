// Rotas do fim da entrevista e de apoio ao teste local:
//   POST /api/sessoes/[id]/finalizar   encerra a sessão e gera (uma vez) o scorecard
//   GET  /api/sessoes/[id]/scorecard   devolve o scorecard gerado
//   GET  /api/dev/sessoes/[id]/estado  visão SEGURA do estado (só dev)
// O scorecard é do recrutador, não do candidato: em produção só sai com o header x-api-key
// (AVALIACOES_API_SECRET). Em dev (NODE_ENV != production ou AGENTE_DEV=1) sai direto, para a página de teste.
import { timingSafeEqual } from "node:crypto";
import { resolverAvaliacao } from "../kits";
import { gerarScorecard, gerarScorecardFalso, type Scorecard } from "../scorecard";
import { criteriosSemEvidencia, transicionar } from "../sessao/estado";
import { contexto } from "./contexto";
import { erro, json, type ParamsId } from "./http";

export function devHabilitado(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AGENTE_DEV === "1";
}

function eRecrutador(req: Request): boolean {
  if (devHabilitado()) return true;
  const segredo = process.env.AVALIACOES_API_SECRET;
  const dado = req.headers.get("x-api-key");
  if (!segredo || !dado) return false;
  const a = Buffer.from(segredo);
  const b = Buffer.from(dado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const eIdPlausivel = (id: string) => id.length > 0 && id.length <= 80;

type Falha = { falha: string; status: number };

/** Geração em andamento por sessão: duas chamadas simultâneas não pagam duas vezes o modelo final. */
const emAndamento = new Map<string, Promise<Scorecard | Falha>>();

export async function finalizarHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const { id } = await params;
  if (!eIdPlausivel(id)) return erro(404, "sessão não encontrada");
  const ctx = contexto();
  const sessao = await ctx.repositorio.obter(id);
  if (!sessao) return erro(404, "sessão não encontrada");
  const verScorecard = eRecrutador(req);
  const resposta = (sc: Scorecard) => json(verScorecard ? sc : { ok: true, gerado: true });

  const pronto = await ctx.repositorio.obterScorecard(id);
  if (pronto) return resposta(pronto);

  if (!ctx.fake && !ctx.llm) {
    return erro(503, "Scorecard indisponível: o servidor está sem OPENROUTER_API_KEY (use AGENTE_FAKE=1 para testar sem chave).");
  }
  const alvo = await resolverAvaliacao(sessao.avaliacaoId);
  if (!alvo) return erro(500, "avaliação da sessão indisponível");

  let tarefa = emAndamento.get(id);
  if (!tarefa) {
    tarefa = (async (): Promise<Scorecard | Falha> => {
      // Encerra a sessão (idempotente: depois de ENCERRADA o reducer ignora tudo).
      const atual = (await ctx.repositorio.obter(id)) ?? sessao;
      const estado = transicionar(atual.estado, { tipo: "ENCERRAR" }, ctx.agora()).estado;
      await ctx.repositorio.salvarEstado(id, estado);
      const entrada = {
        sessaoId: id,
        candidatoId: sessao.candidatoId,
        estado,
        eventos: await ctx.repositorio.listarEventos(id),
        imagens: await ctx.repositorio.listarImagens(id),
      };
      const agora = () => new Date(ctx.agora());
      try {
        const sc =
          ctx.fake || !ctx.llm
            ? gerarScorecardFalso({ kit: alvo.kit, problema: alvo.problema, agora }, entrada)
            : await gerarScorecard({ llm: ctx.llm, kit: alvo.kit, problema: alvo.problema, agora }, entrada);
        await ctx.repositorio.salvarScorecard(id, sc);
        return sc;
      } catch (e) {
        // Só o nome do erro vai ao log: nada de prompt, conversa ou chave.
        console.warn("[agente] scorecard_falhou", { sessao_id: id, erro: e instanceof Error ? e.name : "desconhecido" });
        return { falha: "Não foi possível gerar o scorecard agora. Tente de novo em instantes.", status: 502 };
      }
    })().finally(() => {
      emAndamento.delete(id);
    });
    emAndamento.set(id, tarefa);
  }
  const r = await tarefa;
  if ("falha" in r) return erro(r.status, r.falha);
  return resposta(r);
}

export async function scorecardGetHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const { id } = await params;
  if (!eRecrutador(req)) return erro(404, "não encontrado");
  if (!eIdPlausivel(id)) return erro(404, "sessão não encontrada");
  const ctx = contexto();
  if (!(await ctx.repositorio.obter(id))) return erro(404, "sessão não encontrada");
  const sc = await ctx.repositorio.obterScorecard(id);
  if (!sc) return erro(404, "scorecard ainda não gerado (chame POST /finalizar)");
  return json(sc);
}

/** Visão segura do estado: nada de ficha, rubrica, texto de dúvida pendente ou conversa. */
export async function estadoDevHandler(_req: Request, { params }: ParamsId): Promise<Response> {
  if (!devHabilitado()) return erro(404, "não encontrado");
  const { id } = await params;
  if (!eIdPlausivel(id)) return erro(404, "sessão não encontrada");
  const ctx = contexto();
  const sessao = await ctx.repositorio.obter(id);
  if (!sessao) return erro(404, "sessão não encontrada");
  const e = sessao.estado;
  return json({
    fase: e.fase,
    plin: e.plin,
    plinPendente: e.perguntaPendente !== null,
    perguntaAtiva: e.perguntaAtiva !== null,
    perguntasFeitas: e.perguntasFeitas,
    perguntaFinalFeita: e.perguntaFinalFeita,
    criteriosSemEvidencia: criteriosSemEvidencia(e),
    observacoes: e.observacoes.length,
    analises: sessao.analises,
    scorecardGerado: (await ctx.repositorio.obterScorecard(id)) !== null,
  });
}
