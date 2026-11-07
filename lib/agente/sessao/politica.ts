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

export type MotivoBloqueio =
  | "FASE_NAO_ANALISA"
  | "CANDIDATO_RESPONDENDO"
  | "LIMITE_DE_PERGUNTAS"
  | "INTERVALO_ENTRE_PERGUNTAS";

/**
 * Por que a análise não deve rodar agora (null = pode rodar).
 *
 * Uma dúvida pendente NÃO bloqueia: a análise precisa continuar rodando para poder substituir a
 * pendente por uma mais nova ou cancelá-la com um `ok`.
 */
export function motivoBloqueio(
  estado: EstadoSessao,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
): MotivoBloqueio | null {
  if (!(estado.fase in PLINS_DA_FASE)) return "FASE_NAO_ANALISA";
  // Candidato no meio da resposta: não se interrompe.
  if (estado.plin === "PERGUNTA_ATIVA") return "CANDIDATO_RESPONDENDO";
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

/** A análise pode rodar agora? */
export function podeAnalisar(
  estado: EstadoSessao,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
): boolean {
  return motivoBloqueio(estado, agora, regras) === null;
}

/** Uma resposta com este status pode virar plin agora? */
export function podeLevantarPlin(
  estado: EstadoSessao,
  status: StatusAnalise,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
): boolean {
  if (status === "ok") return false;
  return statusPermitido(estado.fase, status) && podeAnalisar(estado, agora, regras);
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
