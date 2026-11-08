// Rotas de DESENVOLVIMENTO (página /dev/vaga): conversar o plano de entrevista e aprová-lo (gera o
// kit). Só existem fora de produção (ou com AGENTE_DEV=1); sem x-api-key porque são ferramenta local.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InterviewPlan, JobPosting } from "../../hiring/job-posting";
import { ErroGeracaoKit, gerarKitDetalhado, modeloFinal } from "../kits/gerar";
import { repositorioAvaliacoesPadrao } from "../kits/repositorio";
import {
  conversarPlano,
  MAX_DESCRICAO,
  MAX_HISTORICO,
  MAX_TEXTO_TURNO,
  modeloPlanejamento,
} from "../planejamento/conversar";
import { contexto } from "./contexto";
import { criarLimitador, erro, ipDe, json, lerJsonValidado } from "./http";

export const MAX_CORPO_DEV = 256 * 1024;
export const limitadorDevPlano = criarLimitador(30, 60_000);
export const limitadorDevAprovar = criarLimitador(3, 60_000);

export function devHabilitado(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AGENTE_DEV === "1";
}

const naoEncontrado = () => erro(404, "não encontrado");

const EsquemaConversa = z.object({
  descricao: z.string().trim().min(1).max(MAX_DESCRICAO),
  historico: z
    .array(z.object({ quem: z.enum(["usuario", "agente"]), texto: z.string().max(MAX_TEXTO_TURNO) }))
    .max(MAX_HISTORICO),
  vaga: JobPosting.nullish(),
  plano: InterviewPlan.nullish(),
});

export async function planoDevHandler(req: Request): Promise<Response> {
  if (!devHabilitado()) return naoEncontrado();
  if (limitadorDevPlano.estourou(ipDe(req))) return erro(429, "muitas mensagens; tente em instantes");
  const corpo = await lerJsonValidado(req, EsquemaConversa, MAX_CORPO_DEV);
  if (!corpo.ok) return corpo.resposta;
  const ctx = contexto();
  if (!ctx.llm) return erro(503, "LLM indisponível (OPENROUTER_API_KEY ausente; use AGENTE_FAKE=1 para testar sem chave)");
  const { descricao, historico, vaga, plano } = corpo.dados;
  const r = await conversarPlano({
    llm: ctx.llm,
    descricao,
    historico,
    vagaAtual: vaga,
    planoAtual: plano,
    sinal: req.signal,
  });
  return json(r);
}

const EsquemaAprovar = z.object({ vaga: JobPosting, plano: InterviewPlan });

export async function aprovarPlanoDevHandler(req: Request): Promise<Response> {
  if (!devHabilitado()) return naoEncontrado();
  if (limitadorDevAprovar.estourou(ipDe(req))) return erro(429, "muitas aprovações; tente em instantes");
  const corpo = await lerJsonValidado(req, EsquemaAprovar, MAX_CORPO_DEV);
  if (!corpo.ok) return corpo.resposta;
  const { vaga, plano } = corpo.dados;
  if (plano.jobPostingId !== vaga.id) return erro(400, "plano.jobPostingId diferente de vaga.id");
  const ctx = contexto();
  if (!ctx.llm) return erro(503, "LLM indisponível (OPENROUTER_API_KEY ausente; use AGENTE_FAKE=1 para testar sem chave)");

  let r;
  try {
    r = await gerarKitDetalhado({ llm: ctx.llm, vaga, plano, sinal: req.signal });
  } catch (e) {
    if (e instanceof ErroGeracaoKit) {
      return e.codigo === "invalido"
        ? erro(502, "não foi possível gerar um kit válido para este plano", e.erros.slice(0, 10))
        : erro(502, "falha ao chamar o LLM na geração do kit");
    }
    throw e;
  }
  const avaliacaoId = `av_${randomUUID()}`;
  const repo = repositorioAvaliacoesPadrao();
  await repo.criar({ avaliacaoId, kit: r.kit, problema: r.kit.problemas[0], vagaId: vaga.id });
  await repo.aprovar(avaliacaoId);
  return json(
    {
      avaliacao_id: avaliacaoId,
      resumo: {
        area: r.kit.area,
        persona: r.kit.persona,
        titulo: r.kit.problemas[0]?.titulo ?? "",
        criterios: r.kit.criterios.map((c) => c.nome),
      },
      geracao: { modelo: r.modelo, ms: r.ms, tentativas: r.tentativas, custo: r.uso.custo ?? null },
    },
    201,
  );
}

export async function estadoDevHandler(): Promise<Response> {
  if (!devHabilitado()) return naoEncontrado();
  return json({
    fake: process.env.AGENTE_FAKE === "1",
    temChave: !!process.env.OPENROUTER_API_KEY,
    modeloPlanejamento: modeloPlanejamento(),
    modeloFinal: modeloFinal(),
  });
}
