// Núcleo do Totti (lib/totti): a fala que o candidato cortou, igual no live coding e no quadro (#97).
//
// Quando o candidato fala por cima, a voz para onde estava. O histórico guarda a fala só até ali, com uma marca:
// assim o Totti não acha que ele ouviu o resto, e uma pergunta cortada não conta como feita (nem como respondida).
// QUANDO cortar é da voz (lib/voz/detectorDeInterrupcao.ts); aqui só o que fica no texto.

/** Marca no fim da fala cortada. O prompt explica (`avisoDeFalaCortada`) e as travas tiram de qualquer resposta. */
export const MARCA_INTERROMPIDA = "[cortado pelo candidato]";

/** Faltando só isso para o fim (pontuação, um espaço), a fala foi ouvida inteira: não conta como cortada. */
const FOLGA_DO_FIM = 3;

/**
 * A fala como o candidato ouviu: até a última palavra inteira antes de `ate` (caracteres já falados), com a marca.
 * `null` quando nada foi ouvido (a fala sai do histórico); o texto original quando ele ouviu até o fim.
 */
export function falaInterrompida(texto: string, ate: number): string | null {
  const limpo = texto.trim();
  if (ate >= limpo.length - FOLGA_DO_FIM) return limpo;
  let corte = Math.max(0, Math.floor(ate));
  // No meio de uma palavra: ela não chegou a ser dita inteira.
  if (corte > 0 && /\S/u.test(limpo[corte] ?? "") && /\S/u.test(limpo[corte - 1] ?? "")) {
    const espaco = limpo.lastIndexOf(" ", corte);
    corte = espaco < 0 ? 0 : espaco;
  }
  const ouvido = limpo.slice(0, corte).trim().replace(/[\s,;:.!?—–-]+$/u, "");
  return ouvido ? `${ouvido}… ${MARCA_INTERROMPIDA}` : null;
}

export function foiInterrompida(texto: string): boolean {
  return texto.includes(MARCA_INTERROMPIDA);
}

/** O modelo às vezes imita o histórico: a marca nunca sai na fala do Totti. */
export function semMarcaDeInterrupcao(texto: string): string {
  return foiInterrompida(texto) ? texto.replaceAll(MARCA_INTERROMPIDA, "").replace(/\s{2,}/gu, " ").trim() : texto;
}

/** Instrução do prompt, a mesma nas duas salas. */
export const INSTRUCAO_INTERRUPCAO = `Uma fala sua que termina em "${MARCA_INTERROMPIDA}" foi cortada: o candidato falou por cima e só ouviu até ali. Se era uma pergunta, ela não foi feita nem respondida. Responda primeiro ao que ele disse ("pera", uma dúvida, um comentário); depois, se ainda fizer sentido, retome a pergunta com outras palavras. Nunca escreva essa marca.`;

/**
 * A instrução vai junto da conversa só quando há fala cortada nela: o prompt estático (que vai inteiro em toda fala)
 * não cresce, e a explicação chega quando é preciso.
 */
export function avisoDeFalaCortada(textos: readonly string[]): string {
  return textos.some(foiInterrompida) ? `\n(${INSTRUCAO_INTERRUPCAO})` : "";
}
