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

/** A fala cita a "ficha" (material interno que o candidato não deve saber que existe)? */
export function mencionaFicha(texto: string): boolean {
  return normalizar(texto).split(" ").some((p) => p === "ficha" || p === "fichas");
}

/** A fala termina com "?" (contra-pergunta)? */
export function terminaEmPergunta(texto: string): boolean {
  return /\?["')\]\s]*$/.test(texto.trim());
}

/**
 * Limpa de forma determinística a fala do entrevistador do loop rápido:
 *  - "A ficha diz que X" / "Segundo a ficha, X" -> "X" (sem citar a ficha);
 *  - remove frases finais que sejam pergunta (contra-pergunta).
 * Devolve `texto` limpo e quais ajustes foram feitos. Se, depois de limpar, ainda restar
 * menção a "ficha" ou não sobrar texto, devolve texto "" (o chamador fica mudo).
 */
export function limparFalaEntrevistador(texto: string): {
  texto: string;
  ajustes: Array<"cita_ficha" | "contra_pergunta">;
} {
  const ajustes: Array<"cita_ficha" | "contra_pergunta"> = [];
  let t = texto.trim();

  if (mencionaFicha(t)) {
    ajustes.push("cita_ficha");
    t = t
      // "Segundo a ficha, ..." / "De acordo com a ficha, ..." / "Conforme a ficha, ..."
      .replace(/(^|[.!?]\s+)(segundo|conforme|de acordo com|pela|na)\s+(a\s+)?fichas?\s*,?\s*(\S)/gi,
        (_m, ini: string, _p, _a, prox: string) => ini + prox)
      // "A ficha diz que ..." / "A ficha informa que ..."
      .replace(/(^|[.!?]\s+)(a\s+)?fichas?\s+(diz|dizem|informa|indica|mostra|fala|traz|aponta|define|especifica|tem|consta)(\s+que)?\s+(\S)/gi,
        (_m, ini: string, _a, _v, _q, prox: string) => ini + prox);
    // Capitaliza o início de cada frase afetada.
    t = t.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_m, ini: string, c: string) => ini + c.toUpperCase());
    if (mencionaFicha(t)) return { texto: "", ajustes };
  }

  if (terminaEmPergunta(t)) {
    ajustes.push("contra_pergunta");
    const frases = (t.match(/[^.!?]+[.!?]*/g) ?? []).map((f) => f.trim()).filter(Boolean);
    while (frases.length && terminaEmPergunta(frases[frases.length - 1])) frases.pop();
    t = frases.join(" ").trim();
  }

  return { texto: t, ajustes };
}
