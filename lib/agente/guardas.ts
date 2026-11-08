// Guardas estruturais aplicadas à saída do LLM (formato e repetição). NÃO há listas de palavras aqui:
// o que o candidato quis dizer, e o que o agente pode ou não dizer, é decidido no prompt.

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "a o as os um uma uns umas de do da dos das em no na nos nas por para com sem e ou que se como qual quais seu sua seus suas ele ela isso esse essa este esta voce vai ser sao foi tem ter mais mas ao aos pela pelo la aqui ja so".split(
    " ",
  ),
);

function tokens(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(" ")
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/**
 * Sobreposição de tokens (coeficiente de Szymkiewicz-Simpson: interseção / menor conjunto).
 * Exige pelo menos 3 tokens de conteúdo nos dois lados, para frases curtas não colidirem à toa.
 */
export function sobreposicao(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  const menor = Math.min(ta.size, tb.size);
  if (menor < 3) return normalizar(a) === normalizar(b) && ta.size > 0 ? 1 : 0;
  let comum = 0;
  for (const t of ta) if (tb.has(t)) comum++;
  return comum / menor;
}

export const LIMIAR_DUPLICADA = 0.7;

export function eQuaseDuplicada(pergunta: string, anteriores: string[]): boolean {
  return anteriores.some((p) => sobreposicao(pergunta, p) >= LIMIAR_DUPLICADA);
}

/** Corta em no máximo `n` frases (para a fala curta do loop rápido). */
export function limitarFrases(texto: string, n: number): string {
  const frases = texto.trim().match(/[^.!?]+[.!?]*/g) ?? [];
  return frases
    .slice(0, n)
    .map((f) => f.trim())
    .join(" ")
    .trim();
}
