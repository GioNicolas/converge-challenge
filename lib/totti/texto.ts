// Núcleo do Totti (lib/totti): o comportamento do entrevistador, igual no live coding e no quadro.
// Este arquivo tem só as ferramentas de texto que as travas usam (comparar, dividir em frases). Nada aqui sabe
// o que é código, desenho, sessão ou modelo: o núcleo não importa de `lib/agente` nem de `lib/agents`.

/** Em qual sala o Totti está. Só muda o material de que ele fala ("o código" ou "o desenho"). */
export type Sala = "codigo" | "quadro";

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

/** As palavras de conteúdo da frase (sem acento, sem as de ligação). */
export function tokens(texto: string): Set<string> {
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

/** Abreviações comuns que terminam em ponto sem terminar a frase. */
const ABREVIACAO_NO_FIM = /(?:^|[\s(])(?:ex|p\.ex|aprox|sr|sra|dr|dra|vs|obs|pág|pag|n[º°o])\.$/i;

/**
 * Divide em frases. Só pontuação seguida de espaço (ou do fim) termina frase: "2.5", "99.9%" e "R$ 1.000" não
 * cortam, nem abreviações como "ex." e "aprox.".
 */
export function frasesDe(texto: string): string[] {
  const t = texto.trim();
  const frases: string[] = [];
  const fimDeFrase = /[.!?]+(?=\s|$)/g;
  let inicio = 0;
  for (let m = fimDeFrase.exec(t); m; m = fimDeFrase.exec(t)) {
    const fim = m.index + m[0].length;
    const trecho = t.slice(inicio, fim);
    if (m[0] === "." && ABREVIACAO_NO_FIM.test(trecho)) continue;
    frases.push(trecho.trim());
    inicio = fim;
  }
  const resto = t.slice(inicio).trim();
  if (resto) frases.push(resto);
  return frases;
}

/** Corta em no máximo `n` frases (para a fala curta do loop rápido). */
export function limitarFrases(texto: string, n: number): string {
  return frasesDe(texto).slice(0, n).join(" ").trim();
}

/** A fala sem as frases que terminam em pergunta ("" se era só a pergunta). */
export function frasesSemPergunta(texto: string): string {
  return frasesDe(texto.trim()).filter((f) => !f.trim().endsWith("?")).join(" ").trim();
}

/** A primeira letra em maiúscula (o que sobra depois de tirar o começo de uma fala). */
export function comMaiuscula(texto: string): string {
  const t = texto.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
