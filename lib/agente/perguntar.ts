// Loop rápido (o "/perguntar"): o candidato fala com o entrevistador. Responde só pela ficha.
// Registra CANDIDATO_FALOU / AGENTE_FALOU no estado. Não lança por causa do LLM.
import { eEnchimento, limitarFrases, temLinguagemAvaliativa } from "./guardas";
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
};

export type ResultadoPerguntar = {
  responder: boolean;
  texto: string;
  requisito: string | null;
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
  const mudo = (): ResultadoPerguntar => ({ responder: false, texto: "", requisito: null, estado: comFala });

  if (eEnchimento(entrada.texto)) return mudo();

  let saida;
  try {
    const r = await deps.llm.completarJson({
      sistema: {
        estatico: montarSistemaEstaticoPerguntar(deps.kit, deps.problema),
        dinamico: montarSistemaDinamicoPerguntar(estado, entrada.fase, entrada.requisitosAtuais ?? []),
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
    return mudo();
  }

  const texto = limitarFrases(saida.texto, 2);
  if (!saida.responder || !texto) return mudo();
  if (temLinguagemAvaliativa(texto)) {
    log("perguntar_ajuste", { sessao_id: entrada.sessao_id, ajuste: "linguagem_avaliativa" });
    return mudo();
  }
  const requisito = saida.requisito?.trim()
    ? saida.requisito.trim().slice(0, MAX_CARACTERES_REQUISITO)
    : null;
  const repetido = requisito !== null && (entrada.requisitosAtuais ?? []).includes(requisito);

  const final = transicionar(comFala, { tipo: "AGENTE_FALOU", texto }, agora).estado;
  return { responder: true, texto, requisito: repetido ? null : requisito, estado: final };
}
