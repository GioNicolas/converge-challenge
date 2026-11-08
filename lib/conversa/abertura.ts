/**
 * Apresentação e despedida faladas do live coding, no mesmo espírito das do quadro
 * (lib/agente/prompts/abertura.ts): curtas, sem regras nem enunciado lido, deixando claro que o candidato pode
 * falar a qualquer momento. Texto pronto, sem LLM: sai na hora e não falha.
 */

const ABERTURAS = [
  (titulo: string) =>
    `Oi, tudo bem? Vamos começar sua entrevista de live coding. O problema de hoje é ${titulo}, está aí no painel; lê com calma e, quando quiser, vai me contando como pensa em resolver.`,
  (titulo: string) =>
    `Oi! Bora começar sua entrevista de live coding. O desafio é ${titulo}, no painel à esquerda; pode ler com calma e falar comigo a qualquer momento, inclusive pra tirar dúvida do enunciado.`,
  (titulo: string) =>
    `Olá, tudo certo? Vamos para a sua entrevista de live coding. O problema é ${titulo}; dá uma lida com calma e, quando quiser, me conta como você está pensando.`,
];

const DESPEDIDAS = [
  "Era isso, obrigado pelo seu tempo. A entrevista terminou e logo você recebe o retorno.",
  "Fechamos por aqui, valeu pela conversa. Logo você recebe o retorno.",
];

/** Escolha estável por sessão (a mesma sessão não muda de fala se a tela recarregar). */
function indice(semente: string, n: number): number {
  let h = 0;
  for (const c of semente) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

export function aberturaLiveCoding(titulo: string, semente: string): string {
  return ABERTURAS[indice(semente, ABERTURAS.length)](titulo.trim());
}

export function despedidaLiveCoding(semente: string): string {
  return DESPEDIDAS[indice(semente, DESPEDIDAS.length)];
}
