// Guardas determinísticas aplicadas à saída do LLM (não dependem do modelo obedecer ao prompt).

const PALAVRAS_AVALIATIVAS = [
  "correto",
  "correta",
  "errado",
  "errada",
  "otimo",
  "otima",
  "excelente",
  "perfeito",
  "perfeita",
  "parabens",
];

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A fala contém linguagem de validação/elogio ("correto", "ótimo", "parabéns"...)? */
export function temLinguagemAvaliativa(texto: string): boolean {
  const palavras = new Set(normalizar(texto).split(" "));
  return PALAVRAS_AVALIATIVAS.some((p) => palavras.has(p));
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

const FALAS_SEM_RESPOSTA = new Set([
  "ok",
  "okay",
  "hmm",
  "hum",
  "ahn",
  "ta",
  "entendi",
  "certo",
  "beleza",
  "sim",
  "uhum",
  "deixa eu ver",
  "deixa eu pensar",
  "um segundo",
  "pera ai",
  "ok entendi",
  "ok deixa eu ver",
  "hmm deixa eu ver",
]);

/** Fala que claramente não pede resposta (evita gastar uma chamada ao LLM). */
export function eEnchimento(texto: string): boolean {
  const n = normalizar(texto);
  return n === "" || FALAS_SEM_RESPOSTA.has(n);
}
