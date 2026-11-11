// Handlers das rotas /api/avaliacoes/* (passo 1 do produto: vaga -> kit gerado -> revisão humana -> aprovação).
// Server-to-server: protegidas por `x-api-key` == AVALIACOES_API_SECRET (comparação em tempo constante,
// fail closed se a variável não existir). O kit completo (ficha, rubrica) só sai nestas rotas, para
// quem revisa; o candidato nunca as acessa.
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { InterviewPlan, JobPosting } from "../../hiring/job-posting";
import { ErroGeracaoKit, gerarKitDetalhado } from "../kits/gerar";
import { repositorioAvaliacoesPadrao, type RegistroAvaliacao } from "../kits/repositorio";
import type { Kit } from "../kits/tipos";
import { validarKit } from "../kits/validar";
import { contexto } from "./contexto";
import { criarLimitador, erro, ipDe, json, lerJsonValidado, type ParamsId } from "./http";

export const MAX_CORPO_VAGA = 128 * 1024;
export const MAX_CORPO_KIT = 128 * 1024;

/** Geração é cara (modelo grande, raciocínio ligado): 5 por minuto por IP. */
export const limitadorGeracao = criarLimitador(5, 60_000);

const RE_ID_AVALIACAO = /^av_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function igualEmTempoConstante(a: string, b: string): boolean {
  // Hash dos dois lados: tamanhos iguais, sem vazar o tamanho do segredo.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** null = autorizado. Sem AVALIACOES_API_SECRET nada passa. */
export function negarSeNaoAutorizado(req: Request): Response | null {
  const segredo = process.env.AVALIACOES_API_SECRET;
  const enviado = req.headers.get("x-api-key");
  if (!segredo || !enviado || !igualEmTempoConstante(enviado, segredo)) return erro(401, "não autorizado");
  return null;
}

const EsquemaCriar = z.object({ vaga: JobPosting, plano: InterviewPlan.optional() });

function resumoDe(kit: Kit) {
  return {
    area: kit.area,
    persona: kit.persona,
    titulo_problema: kit.problemas[0]?.titulo ?? "",
    criterios: kit.criterios.map((c) => c.nome),
    modoLeitura: kit.modoLeitura,
  };
}

function visaoCompleta(r: RegistroAvaliacao) {
  return {
    avaliacao_id: r.avaliacaoId,
    vaga_id: r.vagaId,
    aprovado: r.aprovado,
    criado_em: new Date(r.criadoEm).toISOString(),
    kit: r.kit,
  };
}

const naoEncontrada = () => erro(404, "avaliação não encontrada");

export async function criarAvaliacaoHandler(req: Request): Promise<Response> {
  const negado = negarSeNaoAutorizado(req);
  if (negado) return negado;
  if (limitadorGeracao.estourou(ipDe(req))) return erro(429, "muitas gerações; tente em instantes");

  const corpo = await lerJsonValidado(req, EsquemaCriar, MAX_CORPO_VAGA);
  if (!corpo.ok) return corpo.resposta;
  const { vaga, plano } = corpo.dados;
  if (plano && plano.jobPostingId !== vaga.id) return erro(400, "plano.jobPostingId diferente de vaga.id");

  const ctx = contexto();
  if (!ctx.llm) return erro(503, "LLM indisponível (OPENROUTER_API_KEY ausente)");

  let resultado;
  try {
    resultado = await gerarKitDetalhado({ llm: ctx.llm, vaga, plano, sinal: req.signal });
  } catch (e) {
    if (e instanceof ErroGeracaoKit) {
      console.warn("[agente] geracao_falhou", { vaga_id: vaga.id, codigo: e.codigo });
      return e.codigo === "invalido"
        ? erro(502, "não foi possível gerar um kit válido para esta vaga", e.erros.slice(0, 10))
        : erro(502, "falha ao chamar o LLM na geração do kit");
    }
    throw e;
  }

  const avaliacaoId = `av_${randomUUID()}`;
  const registro = await repositorioAvaliacoesPadrao().criar({
    avaliacaoId,
    kit: resultado.kit,
    problema: resultado.kit.problemas[0],
    vagaId: vaga.id,
  });
  console.warn("[agente] avaliacao_gerada", {
    avaliacao_id: avaliacaoId,
    vaga_id: vaga.id,
    modelo: resultado.modelo,
    ms: resultado.ms,
    tentativas: resultado.tentativas,
  });
  return json({ avaliacao_id: avaliacaoId, resumo: resumoDe(registro.kit) }, 201);
}

export async function obterAvaliacaoHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const negado = negarSeNaoAutorizado(req);
  if (negado) return negado;
  const { id } = await params;
  if (!RE_ID_AVALIACAO.test(id)) return naoEncontrada();
  const r = await repositorioAvaliacoesPadrao().obter(id);
  return r ? json(visaoCompleta(r)) : naoEncontrada();
}

/** O revisor envia o kit inteiro editado; o id do kit e do problema continuam sendo os do servidor. */
export async function substituirAvaliacaoHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const negado = negarSeNaoAutorizado(req);
  if (negado) return negado;
  const { id } = await params;
  if (!RE_ID_AVALIACAO.test(id)) return naoEncontrada();
  const repo = repositorioAvaliacoesPadrao();
  const atual = await repo.obter(id);
  if (!atual) return naoEncontrada();

  // Aceita {kit} ou o kit direto; a validação completa é a mesma da geração.
  const corpo = await lerJsonValidado(req, z.record(z.unknown()), MAX_CORPO_KIT);
  if (!corpo.ok) return corpo.resposta;
  const bruto = "kit" in corpo.dados && !("criterios" in corpo.dados) ? corpo.dados.kit : corpo.dados;
  const comIds =
    bruto && typeof bruto === "object" && !Array.isArray(bruto)
      ? imporIdsDoRegistro(bruto as Record<string, unknown>, atual)
      : bruto;
  const v = validarKit(comIds, { edicao: true });
  if (!v.ok) return erro(400, "kit inválido", v.erros.slice(0, 20));
  const novo = await repo.substituirKit(id, v.kit, v.kit.problemas[0]);
  if (!novo) return naoEncontrada();
  console.warn("[agente] avaliacao_editada", { avaliacao_id: id });
  return json(visaoCompleta(novo));
}

function imporIdsDoRegistro(kit: Record<string, unknown>, r: RegistroAvaliacao): Record<string, unknown> {
  const problemas = Array.isArray(kit.problemas)
    ? kit.problemas.map((p, i) =>
        i === 0 && p && typeof p === "object" ? { ...(p as object), id: r.problema.id } : p,
      )
    : kit.problemas;
  return { ...kit, id: r.kit.id, problemas };
}

export async function aprovarAvaliacaoHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const negado = negarSeNaoAutorizado(req);
  if (negado) return negado;
  const { id } = await params;
  if (!RE_ID_AVALIACAO.test(id)) return naoEncontrada();
  const r = await repositorioAvaliacoesPadrao().aprovar(id);
  if (!r) return naoEncontrada();
  console.warn("[agente] avaliacao_aprovada", { avaliacao_id: id });
  return json({ avaliacao_id: id, aprovado: true });
}
