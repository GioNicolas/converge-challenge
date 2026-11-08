// O resultado de uma entrevista como o painel da vaga o mostra: o mesmo formato para Live Coding e System Design.
// Só tipos e funções puras (sem servidor), para valer no navegador e no servidor.

export type FormatoDaEntrevista = "live_coding" | "system_design";

/** Live Coding usa avancar | talvez | nao_avancar; o scorecard do System Design tem mais dois valores. */
export type RecomendacaoDoResultado = "avancar" | "avancar_com_ressalvas" | "talvez" | "nao_avancar" | "evidencia_insuficiente";

export type CriterioDoCartao = {
  nome: string;
  /** 1 a 4. null = critério não explorado na entrevista. */
  nota: number | null;
  /** Por que essa nota, em poucas frases. */
  justificativa: string;
};

/** O que aparece ao passar o mouse sobre o resultado: tudo o que a tech lead precisa sem abrir o relatório. */
export type CartaoDoResultado = {
  resumo: string;
  pontosFortes: string[];
  pontosFracos: string[];
  /** O que explorar na próxima etapa. */
  proximosPassos: string[];
  criterios: CriterioDoCartao[];
};

export const NOME_RECOMENDACAO_DO_RESULTADO: Record<RecomendacaoDoResultado, string> = {
  avancar: "Avançar",
  avancar_com_ressalvas: "Avançar com ressalvas",
  talvez: "Talvez",
  nao_avancar: "Não avançar",
  evidencia_insuficiente: "Evidência insuficiente",
};

/** Peso de cada recomendação para desempatar notas iguais: quem avança vem antes. */
const PESO_RECOMENDACAO: Record<RecomendacaoDoResultado, number> = {
  avancar: 4,
  avancar_com_ressalvas: 3,
  talvez: 2,
  evidencia_insuficiente: 1,
  nao_avancar: 0,
};

type Pontuavel = { overallScore?: number; recommendation?: RecomendacaoDoResultado; startedAt: number };

/**
 * Ordem do painel: nota decrescente; sem nota vai para o fim. Empate: a melhor recomendação, depois o mais recente.
 * Não altera a lista recebida.
 */
export function ordenarPorNota<T extends Pontuavel>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => {
    const na = a.overallScore;
    const nb = b.overallScore;
    if (na === undefined && nb === undefined) return b.startedAt - a.startedAt;
    if (na === undefined) return 1;
    if (nb === undefined) return -1;
    if (nb !== na) return nb - na;
    const ra = a.recommendation ? PESO_RECOMENDACAO[a.recommendation] : -1;
    const rb = b.recommendation ? PESO_RECOMENDACAO[b.recommendation] : -1;
    return rb - ra || b.startedAt - a.startedAt;
  });
}

/** Faixa de cor da nota (1 a 4): fraca, razoável, boa, forte. */
export function faixaDaNota(nota: number | null | undefined): "sem" | "fraca" | "razoavel" | "boa" | "forte" {
  if (nota === null || nota === undefined) return "sem";
  if (nota >= 3.5) return "forte";
  if (nota >= 2.75) return "boa";
  if (nota >= 2) return "razoavel";
  return "fraca";
}
