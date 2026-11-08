// Loop rápido (o "/perguntar"): o candidato fala com o entrevistador. Responde só pela ficha.
// Registra CANDIDATO_FALOU / AGENTE_FALOU no estado. Não lança por causa do LLM.
import { limitarFrases, semPerguntaNoFim } from "./guardas";
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
import { transicionar, type Desfecho, type EstadoSessao } from "./sessao/estado";
import type { Fase, FalaRecente } from "./sessao/tipos";
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
  /** Falas recentes que o quadro tem e o servidor talvez não (apresentação, desafio). */
  conversaDoQuadro?: FalaRecente[];
  /** Foto leve do quadro (data URL), para o modelo ver o desenho além do grafo. */
  imagemBase64?: string | null;
  /** O que acabou de mudar no desenho. */
  mudancas?: string;
};

export type ResultadoPerguntar = {
  responder: boolean;
  texto: string;
  requisito: string | null;
  /** O candidato disse que terminou ("pronto"): o quadro avança/reanalisa. */
  concluiu: boolean;
  /** Como ele reagiu à pergunta ativa (só quando havia uma). */
  desfecho: Desfecho | null;
  /** Falha de infraestrutura: não confundir com a decisão deliberada de escutar. */
  falhou?: boolean;
  visual?: AcaoVisual[];
  estado: EstadoSessao;
};

const MAX_CARACTERES_REQUISITO = 60;
export const MAX_FRASES_FALA = 3;

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
  const mudo = (): ResultadoPerguntar => ({ responder: false, texto: "", requisito: null, concluiu: false, desfecho: null, estado: comFala });

  let saida;
  try {
    const r = await deps.llm.completarJson({
      sistema: {
        estatico: montarSistemaEstaticoPerguntar(deps.kit, deps.problema),
        dinamico: montarSistemaDinamicoPerguntar(estado, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes, agora, entrada.conversaDoQuadro, entrada.mudancas, !!entrada.imagemBase64),
      },
      mensagens: [{ role: "user", content: entrada.texto }],
      schema: EsquemaSaidaPerguntar,
      nomeSchema: NOME_SCHEMA_PERGUNTAR,
      modelo: deps.modelo,
      maxTokens: deps.maxTokens ?? 200,
      sinal,
      imagem: entrada.imagemBase64 ?? null,
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
  // O desfecho só vale quando havia pergunta ativa: sem ela, não há assunto para encerrar.
  const haPerguntaAtiva = !!(entrada.perguntaAtiva || estado.perguntaAtiva);
  const desfecho = haPerguntaAtiva ? (saida.desfecho ?? null) : null;
  const mudoOuConcluiu = (): ResultadoPerguntar => ({ ...mudo(), concluiu, desfecho });
  // Até 3 frases: acolher + reagir + um follow-up curto. O prompt pede falas de uma ou duas.
  const curto = limitarFrases(saida.texto, MAX_FRASES_FALA);
  // Assunto solto ("não sei", "pula") ou resposta já justificada: a vez volta com um convite, nunca com outra
  // pergunta. Só a resposta vaga ganha um aprofundamento; o modelo marca qual é qual ("aprofundar"), porque a
  // regra só no prompt o modelo rápido não seguia (abria outro assunto depois de uma resposta justificada).
  const semAprofundar = desfecho === "nao_sabe" || desfecho === "pulou" || (desfecho === "respondeu" && saida.aprofundar !== true);
  const texto = semAprofundar ? semPerguntaNoFim(curto) : curto;
  if (!saida.responder || !texto) return mudoOuConcluiu();
  const requisito = saida.requisito?.trim()
    ? saida.requisito.trim().slice(0, MAX_CARACTERES_REQUISITO)
    : null;
  const repetido = requisito !== null && (entrada.requisitosAtuais ?? []).includes(requisito);

  const final = transicionar(comFala, { tipo: "AGENTE_FALOU", texto }, agora).estado;
  const ids = extrairIdsDoGrafo(entrada.grafo ?? "");
  const visual = mapearAcoesVisuais(saida.visual, (id) => ids.has(id) ? id : null);
  return { responder: true, texto, requisito: repetido ? null : requisito, concluiu, desfecho, estado: final,
    ...(visual !== undefined ? { visual } : {}) };
}
