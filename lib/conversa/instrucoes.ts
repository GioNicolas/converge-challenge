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

/** Live coding: o candidato pediu para encerrar pela voz. Fixa, para sair na hora. */
export const DESPEDIDA_LIVE_CODING =
  "Combinado, vamos encerrar por aqui. Obrigado pela conversa! O retorno vem pela equipe que está cuidando do processo.";

/**
 * Live coding: quem é o Totti, a vaga, a duração, onde está cada coisa e como a conversa funciona. É tudo por
 * voz e ele acompanha o código o tempo todo, então o candidato precisa saber que pode (e deve) falar com ele.
 */
export function comoFuncionaLiveCoding(duracaoMin: number, cargo?: string): string {
  const vaga = cargo?.trim() ? ` para a vaga de ${cargo.trim()}` : "";
  return `Oi, eu sou o Totti e vou conduzir a sua entrevista de programação${vaga}. Ela tem uns ${Math.max(1, Math.round(duracaoMin))} minutos. O problema está no painel à esquerda, você programa no editor e pode rodar os testes quando quiser. Eu vou acompanhar o seu código o tempo todo e, de vez em quando, te perguntar sobre as suas ideias, tudo por voz: pensa em voz alta, me chama quando quiser e, se não souber alguma coisa, é só dizer que a gente segue. Dá uma lida no problema com calma.`;
}
