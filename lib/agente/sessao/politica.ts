// Política do "portão de entrada": funções puras que decidem SE a análise pode rodar e SE uma
// resposta pode virar plin. O quadro já aplica intervalo e limite; aqui o servidor repete a checagem
// como defesa barata (evita gastar uma chamada ao LLM que o quadro ia descartar de qualquer jeito).
import { SILENCIO_INICIAL_S, SILENCIO_S } from "../../contracts";
import { mapearAcoesVisuais } from "../../presenca/acoesVisuais";
import type { EstadoSessao } from "./estado";
import type { Fase, RespostaAnalise, StatusAnalise } from "./tipos";

export type Regras = {
  intervaloEntrePerguntasMs: number;

  maxPerguntas: number;
  /** Tamanho máximo da nota que o cursor escreve no quadro. */
  maxCaracteresNota: number;
};

/**
 * Silêncio total do candidato (sem mexer no desenho nem falar) a partir do qual o agente pode quebrá-lo.
 * Provisório, para os testes. O quadro usa o mesmo valor em `useEntrevista.ts` (SILENCIO_MS).
 */
export const LIMITE_SILENCIO_S = SILENCIO_S;
/**
 * Idem para o começo (fase REQUISITOS): sem falar, sem escrever na conversa e sem desenhar nada.
 * Provisório. O quadro usa o mesmo valor em `useEntrevista.ts` (SILENCIO_INICIAL_MS).
 */
export const LIMITE_SILENCIO_INICIAL_S = SILENCIO_INICIAL_S;

export const REGRAS_PADRAO: Regras = {
  intervaloEntrePerguntasMs: 25_000,
  maxPerguntas: 5,
  maxCaracteresNota: 40,
};

/** Que tipos de plin cada fase aceita. `ok` é sempre permitido (silêncio). */
const PLINS_DA_FASE: Partial<Record<Fase, StatusAnalise[]>> = {
  // REQUISITOS: só `duvida`, para o convite de quem fica em silêncio total no começo (não conta na cota; ver estado.ts).
  REQUISITOS: ["duvida"],
  // ALTO_NIVEL: o modelo decide (pelo tempo parado, ver prompt) se quebra o silêncio; o padrão continua "ok".
  ALTO_NIVEL: ["duvida", "redirecionar", "dica"],
  APROFUNDAMENTO: ["duvida", "redirecionar", "dica"],
  // FECHAMENTO: uma única pergunta final (o limite de "uma" fica em `motivoBloqueio`).
  FECHAMENTO: ["duvida"],
};

export function statusPermitido(fase: Fase, status: StatusAnalise): boolean {
  if (status === "ok") return true;
  return PLINS_DA_FASE[fase]?.includes(status) ?? false;
}

/**
 * O plano da vaga limita as dicas: "nenhuma" bloqueia o status `dica`; "leves" permite uma só.
 * Sem plano, vale só a regra da fase.
 */
export function statusPermitidoNoEstado(estado: EstadoSessao, status: StatusAnalise): boolean {
  if (!statusPermitido(estado.fase, status)) return false;
  if (status !== "dica") return true;
  const dicas = estado.plano?.dicas ?? "livres";
  if (dicas === "nenhuma") return false;
  if (dicas === "leves") return !estado.perguntas.some((p) => p.status === "dica");
  return true;
}

/** Fases em que o /analisar roda (colhe observações). Plin é outra conta: ver PLINS_DA_FASE. */
const FASES_QUE_ANALISAM: Fase[] = ["REQUISITOS", "ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO"];

export type MotivoBloqueio = "FASE_NAO_ANALISA" | "CANDIDATO_RESPONDENDO";

export type MotivoBloqueioPlin =
  | MotivoBloqueio
  | "LIMITE_DE_PERGUNTAS"
  | "INTERVALO_ENTRE_PERGUNTAS"
  | "BOLA_COM_O_CANDIDATO";

/**
 * O que o quadro sabe do candidato no momento da análise. Sem isso a regra "a bola está com ele" não se aplica
 * (o servidor não vê o desenho nem a voz, só o que o quadro manda).
 */
export type ContextoDoCandidato = {
  /** Há quantos segundos ele não mexe no desenho nem fala (vem no pedido de análise). */
  paradoHaS?: number;
};

/**
 * Por que a análise não deve rodar agora (null = pode rodar).
 *
 * Só fase e candidato respondendo bloqueiam. O intervalo entre perguntas e o limite de perguntas NÃO
 * bloqueiam a análise: o agente segue colhendo observações para o scorecard, mesmo quando não
 * pode levantar um plin (ver `motivoBloqueioPlin`). Uma dúvida pendente também não bloqueia
 * (é preciso poder substituí-la ou cancelá-la).
 */
export function motivoBloqueio(estado: EstadoSessao): MotivoBloqueio | null {
  if (!FASES_QUE_ANALISAM.includes(estado.fase)) return "FASE_NAO_ANALISA";
  // Candidato no meio da resposta: não se interrompe.
  if (estado.plin === "PERGUNTA_ATIVA") return "CANDIDATO_RESPONDENDO";
  return null;
}

/** A análise pode rodar agora? (`agora` e `regras` ficam na assinatura por compatibilidade.) */
export function podeAnalisar(
  estado: EstadoSessao,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _agora?: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _regras?: Regras,
): boolean {
  return motivoBloqueio(estado) === null;
}

/** Por que um plin não pode ser levantado agora (null = pode). Inclui limite e intervalo. */
export function motivoBloqueioPlin(
  estado: EstadoSessao,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
  candidato: ContextoDoCandidato = {},
): MotivoBloqueioPlin | null {
  const base = motivoBloqueio(estado);
  if (base) return base;
  // REQUISITOS aceita um único convite (o silêncio inicial): não gasta a cota de 5, mas não se repete.
  if (estado.fase === "REQUISITOS" && estado.conviteFeito) return "LIMITE_DE_PERGUNTAS";
  if (estado.fase === "FECHAMENTO") {
    if (estado.perguntaFinalFeita) return "LIMITE_DE_PERGUNTAS";
  } else if (estado.perguntasFeitas >= regras.maxPerguntas) {
    return "LIMITE_DE_PERGUNTAS";
  }
  if (
    estado.ultimaPerguntaEm !== null &&
    agora - estado.ultimaPerguntaEm < regras.intervaloEntrePerguntasMs
  ) {
    return "INTERVALO_ENTRE_PERGUNTAS";
  }
  // A bola está com o candidato: depois de qualquer fala solta do agente (resposta, comentário, continuação) ele
  // não pergunta de novo até o candidato agir (falar ou mexer no desenho). Sem ação dele, só um silêncio de verdade
  // (o mesmo limite que já quebra o silêncio) libera a pergunta.
  const fala = estado.ultimaFalaDoAgenteEm;
  if (fala != null && candidato.paradoHaS !== undefined) {
    const agiuDepois = agora - candidato.paradoHaS * 1000 > fala;
    const silencioS = estado.fase === "REQUISITOS" ? SILENCIO_INICIAL_S : SILENCIO_S;
    if (!agiuDepois && agora - fala < silencioS * 1000) return "BOLA_COM_O_CANDIDATO";
  }
  return null;
}

/** Uma resposta com este status pode virar plin agora? (fase + intervalo + limite) */
export function podeLevantarPlin(
  estado: EstadoSessao,
  status: StatusAnalise,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
  candidato: ContextoDoCandidato = {},
): boolean {
  if (status === "ok") return false;
  return statusPermitidoNoEstado(estado, status) && motivoBloqueioPlin(estado, agora, regras, candidato) === null;
}

/** Extrai os ids curtos do grafo (linhas "- [e1] Postgres (elipse)" ou "- [s1] A → B"). */
export function extrairIdsDoGrafo(grafo: string): Set<string> {
  return new Set([...grafo.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1]));
}

function cortar(texto: string, max: number) {
  return texto.length <= max ? texto : texto.slice(0, max).trimEnd();
}

/** Resposta de silêncio, mantendo as observações (elas valem para o scorecard mesmo sem plin). */
function silenciar(resposta: RespostaAnalise): RespostaAnalise {
  return { ...resposta, status: "ok", pergunta: null, nota: null, elementos: [], degrau: null, ...(resposta.visual ? { visual: [] } : {}) };
}

/**
 * Última barreira antes de devolver a resposta ao quadro:
 * - rebaixa para `ok` o que a fase/intervalo/limite não permite, ou o plin sem pergunta;
 * - descarta ids de `elementos` que não existem no grafo recebido (e repetidos);
 * - corta a `nota` em ~40 caracteres (sem nota, usa a pergunta cortada, como o quadro faz).
 */
export function filtrarResposta(
  estado: EstadoSessao,
  resposta: RespostaAnalise,
  idsDoGrafo: ReadonlySet<string>,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
  candidato: ContextoDoCandidato = {},
): RespostaAnalise {
  const filtrada = filtrarPlin(estado, resposta, idsDoGrafo, agora, regras, candidato);
  // O sinal de prontidão independe do plin, mas só vale em ALTO_NIVEL.
  return { ...filtrada, avancar_fase: resposta.avancar_fase === true && estado.fase === "ALTO_NIVEL" };
}

function filtrarPlin(
  estado: EstadoSessao,
  resposta: RespostaAnalise,
  idsDoGrafo: ReadonlySet<string>,
  agora: number,
  regras: Regras,
  candidato: ContextoDoCandidato,
): RespostaAnalise {
  if (resposta.status === "ok") return silenciar(resposta);
  const pergunta = resposta.pergunta?.trim();
  if (!pergunta || !podeLevantarPlin(estado, resposta.status, agora, regras, candidato)) {
    return silenciar(resposta);
  }
  const nota = cortar((resposta.nota?.trim() || pergunta).trim(), regras.maxCaracteresNota);
  const elementos = [...new Set(resposta.elementos)].filter((id) => idsDoGrafo.has(id));
  return { ...resposta, pergunta, nota, elementos,
    ...(resposta.visual ? { visual: mapearAcoesVisuais(resposta.visual, (id) => idsDoGrafo.has(id) ? id : null) } : {}) };
}
