// Loop rápido (o "/perguntar"): o candidato fala com o entrevistador. Responde só pela ficha.
// Registra CANDIDATO_FALOU / AGENTE_FALOU no estado. Não lança por causa do LLM.
import { limitarFrases, semPerguntaNoFim, semPerguntaNoFimV2 } from "./guardas";
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
import { montarSistemaDinamicoPerguntarV2, montarSistemaEstaticoPerguntarV2, NOME_SCHEMA_PERGUNTAR_V2 } from "./prompts/entrevistador-v2";
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
  /** Versão do Totti no quadro; sem valor, a de TOTTI_QUADRO (padrão v1). */
  versao?: VersaoTottiQuadro;
};

export type VersaoTottiQuadro = "v1" | "v2";

/** Qual Totti responde no quadro: v1 (regras) ou v2 (objetivos, docs/totti-v2-conversa.md). */
export function versaoTottiQuadro(): VersaoTottiQuadro {
  return process.env.TOTTI_QUADRO === "v2" ? "v2" : "v1";
}

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
  /** A fala terminou numa pergunta do Conversador (v2): conta no intervalo do plin. */
  perguntou?: boolean;
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

  const v2 = (deps.versao ?? versaoTottiQuadro()) === "v2";
  let saida;
  try {
    const r = await deps.llm.completarJson({
      sistema: v2
        ? {
            estatico: montarSistemaEstaticoPerguntarV2(deps.kit, deps.problema),
            dinamico: montarSistemaDinamicoPerguntarV2(estado, deps.kit, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes, agora, entrada.conversaDoQuadro, entrada.mudancas, !!entrada.imagemBase64),
          }
        : {
            estatico: montarSistemaEstaticoPerguntar(deps.kit, deps.problema),
            dinamico: montarSistemaDinamicoPerguntar(estado, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes, agora, entrada.conversaDoQuadro, entrada.mudancas, !!entrada.imagemBase64),
          },
      mensagens: [{ role: "user", content: entrada.texto }],
      schema: EsquemaSaidaPerguntar,
      nomeSchema: v2 ? NOME_SCHEMA_PERGUNTAR_V2 : NOME_SCHEMA_PERGUNTAR,
      modelo: deps.modelo,
      maxTokens: deps.maxTokens ?? 200,
      sinal,
      imagem: entrada.imagemBase64 ?? null,
    });
    saida = r.dados;
    // Quem respondeu de fato este turno: com reserva e disjuntor no `lib/llm`, o modelo configurado nem sempre é
    // o que fala. Sem isso não dá para saber se o Totti "burro" era o modelo forte ou a reserva.
    log("perguntar_llm", {
      sessao_id: entrada.sessao_id,
      versao: v2 ? "v2" : "v1",
      modelo: r.modelo ?? "desconhecido",
      provedor: r.provedor ?? "desconhecido",
      ms: r.ms,
      tokens_entrada: r.uso?.entrada,
      tokens_saida: r.uso?.saida,
      custo_usd: r.uso?.custo,
    });
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
  // No v2 quem conduz é o Conversador: depois de uma resposta ele pode puxar um fio; só "não sei"/"pula" perdem a pergunta.
  const semAprofundar = desfecho === "nao_sabe" || desfecho === "pulou" || (!v2 && desfecho === "respondeu" && saida.aprofundar !== true);
  // v2: só tira a pergunta do fim; o convite enlatado entra apenas se não sobrar fala nenhuma.
  const texto = semAprofundar ? (v2 ? semPerguntaNoFimV2(curto) : semPerguntaNoFim(curto)) : curto;
  if (!saida.responder || !texto) return mudoOuConcluiu();
  const requisito = saida.requisito?.trim()
    ? saida.requisito.trim().slice(0, MAX_CARACTERES_REQUISITO)
    : null;
  const repetido = requisito !== null && (entrada.requisitosAtuais ?? []).includes(requisito);

  // v2: a pergunta do Conversador conta no intervalo do plin, para o Pensador não emendar outra logo em seguida.
  const perguntou = v2 && texto.trim().endsWith("?");
  const final = transicionar(comFala, { tipo: "AGENTE_FALOU", texto, ...(perguntou ? { perguntou } : {}) }, agora).estado;
  const ids = extrairIdsDoGrafo(entrada.grafo ?? "");
  const visual = mapearAcoesVisuais(saida.visual, (id) => ids.has(id) ? id : null);
  return { responder: true, texto, requisito: repetido ? null : requisito, concluiu, desfecho, estado: final,
    ...(perguntou ? { perguntou } : {}),
    ...(visual !== undefined ? { visual } : {}) };
}
