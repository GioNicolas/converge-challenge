/**
 * Como a entrevista funciona, dito logo depois do cumprimento (quadro e live coding). Texto fixo, sem LLM:
 * sai na hora, não falha, e deixa claro o tempo, o formato e que "não sei" é uma resposta aceita.
 */

/** Minutos para falar ("uns 10 minutos"), arredondado para cima e nunca menos de 1. */
function minutos(totalSegundos: number): number {
  return Math.max(1, Math.ceil(totalSegundos / 60));
}

/** Quadro (system design): a soma dos tempos das fases é a duração. */
export function comoFuncionaQuadro(temposDasFasesS: Partial<Record<string, number>>): string {
  const total = Object.values(temposDasFasesS).reduce<number>((soma, s) => soma + (s ?? 0), 0);
  const duracao = total > 0 ? `A entrevista tem uns ${minutos(total)} minutos. ` : "";
  return `${duracao}Primeiro você entende o problema e pode me perguntar o que precisar sobre os requisitos; depois desenha a visão geral no quadro, e no fim a gente aprofunda em algumas partes. Pensa em voz alta e, se não souber alguma coisa, é só dizer que a gente segue para o próximo ponto.`;
}

/** Live coding: duração da vaga, onde está cada coisa e o mesmo combinado do "não sei". */
export function comoFuncionaLiveCoding(duracaoMin: number): string {
  return `Oi, eu sou o Totti e vou acompanhar a sua entrevista de programação. Ela tem uns ${Math.max(1, Math.round(duracaoMin))} minutos: o problema está no painel à esquerda, você programa no editor e pode rodar os testes quando quiser. Pensa em voz alta, pode tirar dúvidas do enunciado comigo e, se não souber alguma coisa, é só dizer que a gente segue.`;
}
