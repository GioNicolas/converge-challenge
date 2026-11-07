// Política do "portão de entrada": funções puras que decidem SE a análise pode rodar e SE uma
// resposta pode virar plin. O quadro já aplica intervalo e limite; aqui o servidor repete a checagem
// como defesa barata (evita gastar uma chamada ao LLM que o quadro ia descartar de qualquer jeito).
import type { EstadoSessao } from "./estado";
import type { Fase, RespostaAnalise, StatusAnalise } from "./tipos";

export type Regras = {
  intervaloEntrePerguntasMs: number;
  maxPerguntas: number;
  /** Tamanho máximo da nota que o cursor escreve no quadro. */
  maxCaracteresNota: number;
};

export const REGRAS_PADRAO: Regras = {
  intervaloEntrePerguntasMs: 60_000,
  maxPerguntas: 5,
  maxCaracteresNota: 40,
};

/** Que tipos de plin cada fase aceita. `ok` é sempre permitido (silêncio). */
const PLINS_DA_FASE: Partial<Record<Fase, StatusAnalise[]>> = {
  // REQUISITOS: nenhum plin (o candidato ainda está combinando o problema).
  ALTO_NIVEL: ["redirecionar"],
  APROFUNDAMENTO: ["duvida", "redirecionar", "dica"],
  // FECHAMENTO: uma única pergunta final (o limite de "uma" fica em `motivoBloqueio`).
  FECHAMENTO: ["duvida"],
};

export function statusPermitido(fase: Fase, status: StatusAnalise): boolean {
  if (status === "ok") return true;
  return PLINS_DA_FASE[fase]?.includes(status) ?? false;
}

/** Fases em que o /analisar roda (colhe observações). Plin é outra conta: ver PLINS_DA_FASE. */
const FASES_QUE_ANALISAM: Fase[] = ["REQUISITOS", "ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO"];

export type MotivoBloqueio = "FASE_NAO_ANALISA" | "CANDIDATO_RESPONDENDO";

export type MotivoBloqueioPlin =
  | MotivoBloqueio
  | "LIMITE_DE_PERGUNTAS"
  | "INTERVALO_ENTRE_PERGUNTAS";

/**
 * Por que a análise não deve rodar agora (null = pode rodar).
 *
 * Só fase e candidato respondendo bloqueiam. O intervalo de 60s e o limite de perguntas NÃO
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
): MotivoBloqueioPlin | null {
  const base = motivoBloqueio(estado);
  if (base) return base;
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
  return null;
}

/** Uma resposta com este status pode virar plin agora? (fase + intervalo + limite) */
export function podeLevantarPlin(
  estado: EstadoSessao,
  status: StatusAnalise,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
): boolean {
  if (status === "ok") return false;
  return statusPermitido(estado.fase, status) && motivoBloqueioPlin(estado, agora, regras) === null;
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
  return { ...resposta, status: "ok", pergunta: null, nota: null, elementos: [], degrau: null };
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
): RespostaAnalise {
  if (resposta.status === "ok") return silenciar(resposta);
  const pergunta = resposta.pergunta?.trim();
  if (!pergunta || !podeLevantarPlin(estado, resposta.status, agora, regras)) {
    return silenciar(resposta);
  }
  const nota = cortar((resposta.nota?.trim() || pergunta).trim(), regras.maxCaracteresNota);
  const elementos = [...new Set(resposta.elementos)].filter((id) => idsDoGrafo.has(id));
  return { ...resposta, pergunta, nota, elementos };
}
