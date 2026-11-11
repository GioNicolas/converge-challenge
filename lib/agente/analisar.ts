// Análise do desenho (o "/analisar"): portão de entrada -> prompt -> LLM -> guardas -> máquina de estados.
// Nunca lança por causa do LLM: em erro/timeout devolve `ok` (o quadro descarta análises lentas de
// qualquer jeito). Só metadados vão para o log (nada de grafo, fala ou chave).
import { PRAZO_ANALISE_DO_DESENHO_MS } from "../contracts";
import { eQuaseDuplicada, sobreposicao, LIMIAR_DUPLICADA, trocarIdsPorNomes } from "./guardas";
import type { LlmCliente } from "./llm/cliente";
import type { Kit, Problema } from "./kits/tipos";
import { montarPromptAvaliador, NOME_SCHEMA_ANALISE } from "./prompts/avaliador";
import {
  transicionar,
  type Efeito,
  type EstadoSessao,
} from "./sessao/estado";
import {
  extrairIdsDoGrafo,
  filtrarResposta,
  podeAnalisar,
  REGRAS_PADRAO,
  type Regras,
} from "./sessao/politica";
import { EsquemaRespostaAnalise, type PedidoAnalise, type RespostaAnalise } from "./sessao/tipos";

export type LogMeta = (evento: string, meta: Record<string, unknown>) => void;

export type DepsAnalisar = {
  llm: LlmCliente;
  kit: Kit;
  problema: Problema;
  regras?: Regras;
  modelo?: string;
  maxTokens?: number;
  log?: LogMeta;
};

export type ResultadoAnalise = {
  resposta: RespostaAnalise;
  estado: EstadoSessao;
  efeitos: Efeito[];
  diagnostico: {
    origem: "llm" | "bloqueado" | "erro";
    /** Por que a resposta do LLM foi rebaixada/alterada pelas guardas. */
    ajustes: string[];
    ms?: number;
    uso?: { entrada: number; saida: number; cache?: number; custo?: number; modelo?: string; provedor?: string; reservaDisparada?: boolean };
  };
};

export const logPadrao: LogMeta = (evento, meta) => console.warn(`[agente] ${evento}`, meta);

export function respostaSilencio(): RespostaAnalise {
  return { status: "ok", pergunta: null, nota: null, elementos: [], degrau: null, observacoes: [] };
}

/**
 * Refiltra uma resposta já filtrada com o estado MAIS RECENTE da sessão. A análise leva até alguns segundos
 * e, nesse intervalo, o agente pode ter falado (`ultimaFalaDoAgenteEm`): o estado lido no início não enxerga
 * isso. Conservador: o tempo decorrido desde o início soma-se ao `parado_ha_s`, ou seja, assume que o
 * candidato não agiu durante a análise. Idempotente para resposta já silenciada (nada é ressuscitado).
 */
export function refiltrarComEstadoAtual(
  atual: EstadoSessao,
  resposta: RespostaAnalise,
  pedido: PedidoAnalise,
  inicio: number,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
): RespostaAnalise {
  const paradoHaS = pedido.parado_ha_s === undefined ? undefined : pedido.parado_ha_s + Math.max(0, agora - inicio) / 1000;
  return filtrarResposta(atual, resposta, extrairIdsDoGrafo(pedido.grafo), agora, regras, { paradoHaS });
}

export async function analisar(
  deps: DepsAnalisar,
  estado: EstadoSessao,
  pedido: PedidoAnalise,
  agora: number,
  sinal?: AbortSignal,
): Promise<ResultadoAnalise> {
  const regras = deps.regras ?? REGRAS_PADRAO;
  const log = deps.log ?? logPadrao;

  if (!podeAnalisar(estado, agora, regras)) {
    return {
      resposta: respostaSilencio(),
      estado,
      efeitos: [],
      diagnostico: { origem: "bloqueado", ajustes: [] },
    };
  }

  const prompt = montarPromptAvaliador(deps.kit, deps.problema, estado, pedido, agora);
  let bruta: RespostaAnalise;
  let ms: number | undefined;
  let uso: ResultadoAnalise["diagnostico"]["uso"];
  try {
    const r = await deps.llm.completarJson({
      sistema: prompt.sistema,
      mensagens: prompt.mensagens,
      schema: EsquemaRespostaAnalise,
      nomeSchema: NOME_SCHEMA_ANALISE,
      modelo: deps.modelo,
      maxTokens: deps.maxTokens,
      timeoutMs: PRAZO_ANALISE_DO_DESENHO_MS,
      sinal,
      imagem: pedido.imagem_base64 ?? null,
    });
    bruta = EsquemaRespostaAnalise.parse(r.dados);
    ms = r.ms;
    uso = r.uso;
    if (uso) uso = { ...uso, modelo: r.modelo, provedor: r.provedor, reservaDisparada: r.reservaDisparada };
  } catch (e) {
    // Só metadados: o tipo do erro, nunca mensagem com conteúdo, grafo ou chave.
    const codigo = (e as { codigo?: string }).codigo ?? "desconhecido";
    log("analise_falhou", { sessao_id: pedido.sessao_id, fase: estado.fase, codigo });
    return {
      resposta: respostaSilencio(),
      estado,
      efeitos: [],
      diagnostico: { origem: "erro", ajustes: [`llm_${codigo}`] },
    };
  }

  const ajustes: string[] = [];
  let resposta: RespostaAnalise = bruta;

  if (resposta.status !== "ok") {
    const pendente = estado.perguntaPendente;

    if (
      pendente?.pergunta &&
      resposta.pergunta &&
      sobreposicao(resposta.pergunta, pendente.pergunta) >= LIMIAR_DUPLICADA
    ) {
      // O modelo repetiu a dúvida que já está pendente: mantém a pendente em vez de cancelá-la.
      ajustes.push("repete_pendente");
      resposta = {
        ...resposta,
        status: pendente.status,
        pergunta: pendente.pergunta,
        nota: pendente.nota,
        elementos: pendente.elementos,
        degrau: pendente.degrau,
      };
    } else if (
      resposta.pergunta &&
      eQuaseDuplicada(
        resposta.pergunta,
        estado.perguntas.map((p) => p.pergunta),
      )
    ) {
      ajustes.push("pergunta_repetida");
      resposta = { ...resposta, status: "ok" };
    }
  }

  if (resposta.pergunta && /\b[a-z]\d+\b/i.test(resposta.pergunta)) {
    const pergunta = trocarIdsPorNomes(resposta.pergunta, pedido.grafo);
    if (pergunta !== resposta.pergunta) {
      ajustes.push("ids_na_fala");
      resposta = { ...resposta, pergunta, ...(resposta.nota ? { nota: trocarIdsPorNomes(resposta.nota, pedido.grafo) } : {}) };
    }
  }

  const filtrada = filtrarResposta(estado, resposta, extrairIdsDoGrafo(pedido.grafo), agora, regras, { paradoHaS: pedido.parado_ha_s });
  if (resposta.status !== "ok" && filtrada.status === "ok") ajustes.push("rebaixada_pela_politica");

  const t = transicionar(estado, { tipo: "ANALISE_RECEBIDA", resposta: filtrada }, agora, regras);
  log("analise_ok", {
    sessao_id: pedido.sessao_id,
    fase: estado.fase,
    status: filtrada.status,
    avancar_fase: filtrada.avancar_fase === true,
    ajustes,
    ms,
  });
  return {
    resposta: filtrada,
    estado: t.estado,
    efeitos: t.efeitos,
    diagnostico: { origem: "llm", ajustes, ms, uso },
  };
}
