/**
 * Leitura da linguagem que a recrutadora restringiu, sem LLM: "só Python", "apenas em C++",
 * "Python somente", "sem C++", "pode ser qualquer linguagem". Funções puras.
 *
 * Só vale para as linguagens que a IDE roda (`LINGUAGENS_IDE`). Mencionar uma linguagem sem restringir
 * ("o time usa Python") não muda nada: no padrão o candidato escolhe na IDE entre todas.
 */

/** Linguagens que a IDE executa, na ordem em que aparecem no seletor. */
export const LINGUAGENS_IDE = ["python", "cpp"] as const;
export type LinguagemIDE = (typeof LINGUAGENS_IDE)[number];

const PADROES: Record<LinguagemIDE, string> = {
  python: "python",
  cpp: "(?:c\\+\\+|cpp|c plus plus|c mais mais)",
};

/** Palavras que restringem: "só", "somente", "apenas", "exclusivamente", "unicamente". */
const RESTRICAO = "(?:so|somente|apenas|exclusivamente|unicamente)";
/** Até três palavras entre a restrição e a linguagem: "só em", "apenas na linguagem", "só pode ser". */
const PONTE = "(?:\\s+\\S+){0,3}?\\s+";

/** Minúsculas, sem acento e com espaços simples. Mantém "+" (C++). */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Fim de "palavra" que também funciona depois de "+" (onde `\b` não serve). */
const FIM = "(?=$|[^a-z0-9+])";
const INICIO = "(?:^|(?<=[^a-z0-9+]))";

function restringida(t: string, lang: LinguagemIDE): boolean {
  const l = PADROES[lang];
  return (
    new RegExp(`${INICIO}${RESTRICAO}${PONTE}${l}${FIM}`).test(t) ||
    new RegExp(`${INICIO}${RESTRICAO}\\s+${l}${FIM}`).test(t) ||
    new RegExp(`${INICIO}${l}\\s+(?:${RESTRICAO}|e mais nada|e so)${FIM}`).test(t)
  );
}

function excluida(t: string, lang: LinguagemIDE): boolean {
  const l = PADROES[lang];
  return new RegExp(`${INICIO}(?:sem|nada de|menos|exceto|nao (?:quero|precisa(?: de)?|usar|vale))\\s+(?:o\\s+|a\\s+)?${l}${FIM}`).test(t);
}

/**
 * Linguagens que a recrutadora restringiu nesta fala, ou undefined se a fala não fala disso.
 * "qualquer linguagem" / "as duas" devolvem todas (desfaz uma restrição anterior).
 */
export function lerLinguagens(texto: string): LinguagemIDE[] | undefined {
  const t = normalizar(texto);
  if (/\b(?:qualquer linguagem|linguagem (?:livre|que (?:ele|ela|o candidato|a candidata) quiser)|tanto faz a linguagem|as duas linguagens)\b/.test(t)) {
    return [...LINGUAGENS_IDE];
  }

  // "não só Python, também C++" não restringe.
  const so = /\bnao (?:so|somente|apenas)\b/.test(t) ? [] : LINGUAGENS_IDE.filter((l) => restringida(t, l));
  if (so.length) return so;

  const sem = LINGUAGENS_IDE.filter((l) => excluida(t, l));
  if (sem.length && sem.length < LINGUAGENS_IDE.length) return LINGUAGENS_IDE.filter((l) => !sem.includes(l));
  return undefined;
}

const NOMES: Record<LinguagemIDE, string> = { python: "Python", cpp: "C++" };

/** "Python", "Python ou C++": nome para a fala da Totti. */
export function nomesDasLinguagens(langs: readonly string[]): string {
  const nomes = langs.map((l) => NOMES[l as LinguagemIDE] ?? l);
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} ou ${nomes[nomes.length - 1]}`;
}
