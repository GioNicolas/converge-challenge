// Loop rápido (o "/perguntar"): o candidato fala com o entrevistador. Responde só pela ficha.
// Registra CANDIDATO_FALOU / AGENTE_FALOU no estado. Não lança por causa do LLM.
import { limitarFrases } from "./guardas";
import { mapearAcoesVisuais, type AcaoVisual } from "../presenca/acoesVisuais";
import { extrairIdsDoGrafo } from "./sessao/politica";
import type { LlmCliente } from "./llm/cliente";
import type { Kit, Problema } from "./kits/tipos";
import {
  EsquemaSaidaPerguntar,
  montarSistemaDinamicoPerguntar,
  montarSistemaEstaticoPerguntar,
  NOME_SCHEMA_PERGUNTAR,
} from "./prompts/entrevistador";
import { transicionar, type EstadoSessao } from "./sessao/estado";
import type { Fase } from "./sessao/tipos";
import { logPadrao, type LogMeta } from "./analisar";

export type DepsPerguntar = {
  llm: LlmCliente;
  kit: Kit;
  problema: Problema;
  modelo?: string;
  maxTokens?: number;
  log?: LogMeta;
};

export type EntradaPerguntar = {
  fase: Fase;
  texto: string;
  /** Itens que já estão no quadro de requisitos (para não repetir). Opcional. */
  requisitosAtuais?: string[];
  sessao_id?: string;
  grafo?: string;
  perguntaAtiva?: string;
  gestosRecentes?: string[];
};

export type ResultadoPerguntar = {
  responder: boolean;
  texto: string;
  requisito: string | null;
  /** O candidato disse que terminou ("pronto"): o quadro avança/reanalisa. */
  concluiu: boolean;
  /** Falha de infraestrutura: não confundir com a decisão deliberada de escutar. */
  falhou?: boolean;
  visual?: AcaoVisual[];
  estado: EstadoSessao;
};

const MAX_CARACTERES_REQUISITO = 60;

export async function perguntar(
  deps: DepsPerguntar,
  estado: EstadoSessao,
  entrada: EntradaPerguntar,
  agora: number,
  sinal?: AbortSignal,
): Promise<ResultadoPerguntar> {
  const log = deps.log ?? logPadrao;
  // A fala entra na conversa antes de o LLM ver o histórico (ele recebe a fala como mensagem).
  const comFala = transicionar(
    estado,
    { tipo: "CANDIDATO_FALOU", texto: entrada.texto, fimDeResposta: false },
    agora,
  ).estado;
  const mudo = (): ResultadoPerguntar => ({ responder: false, texto: "", requisito: null, concluiu: false, estado: comFala });

  let saida;
  try {
    const r = await deps.llm.completarJson({
      sistema: {
        estatico: montarSistemaEstaticoPerguntar(deps.kit, deps.problema),
        dinamico: montarSistemaDinamicoPerguntar(estado, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes),
      },
      mensagens: [{ role: "user", content: entrada.texto }],
      schema: EsquemaSaidaPerguntar,
      nomeSchema: NOME_SCHEMA_PERGUNTAR,
      modelo: deps.modelo,
      maxTokens: deps.maxTokens ?? 200,
      sinal,
    });
    saida = r.dados;
  } catch (e) {
    log("perguntar_falhou", {
      sessao_id: entrada.sessao_id,
      fase: entrada.fase,
      codigo: (e as { codigo?: string }).codigo ?? "desconhecido",
    });
    return { ...mudo(), falhou: true };
  }

  // Se o candidato terminou é o modelo quem interpreta; o código não procura palavras.
  const concluiu = saida.concluiu === true;
  const mudoOuConcluiu = (): ResultadoPerguntar => ({ ...mudo(), concluiu });
  const texto = limitarFrases(saida.texto, 2);
  if (!saida.responder || !texto) return mudoOuConcluiu();
  const requisito = saida.requisito?.trim()
    ? saida.requisito.trim().slice(0, MAX_CARACTERES_REQUISITO)
    : null;
  const repetido = requisito !== null && (entrada.requisitosAtuais ?? []).includes(requisito);

  const final = transicionar(comFala, { tipo: "AGENTE_FALOU", texto }, agora).estado;
  const ids = extrairIdsDoGrafo(entrada.grafo ?? "");
  const visual = mapearAcoesVisuais(saida.visual, (id) => ids.has(id) ? id : null);
  return { responder: true, texto, requisito: repetido ? null : requisito, concluiu, estado: final,
    ...(visual !== undefined ? { visual } : {}) };
}
