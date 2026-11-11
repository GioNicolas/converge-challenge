/**
 * Frases e trechos das falas da recrutadora: separação em frases, forma comparável e palavras-chave.
 * Usado pelo guia (`guia.ts`), pelos pesos (`pesos.ts`) e pelo extrator. Funções puras.
 */

/** Forma comparável de um texto: sem acento, sem caixa, só letras e números separados por um espaço. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Ponto que não termina frase: o de nome de tecnologia ("Next.js", "Node.js", "ASP.NET"), inclusive quando a transcrição
 * de voz põe espaço depois dele ("Next. js"), e o de abreviação comum ("ex.", "vs.").
 */
const PONTO_ABREVIACAO = /\b(?:ex|vs|sr|sra|dr|dra)\./gi;
/** Sem a flag "i" de propósito: "Sim. TS não importa" é uma frase nova, "Next. js" não. */
const PONTO_TECNOLOGIA = /(?<=\w)\.(?=\s*(?:js|ts|net|NET|io|py)\b)/g;
const MARCA_PONTO = "\u0000";

/** Frases de um texto, cortadas depois de cada pontuação final. Não corta em "Next.js", "Node. js" nem em "ex.". */
export function frasesDe(texto: string): string[] {
  return texto
    .replace(PONTO_ABREVIACAO, (m) => m.replace(".", MARCA_PONTO))
    .replace(PONTO_TECNOLOGIA, MARCA_PONTO)
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.split(MARCA_PONTO).join("."))
    .map((f) => f.trim())
    .filter(Boolean);
}

/** A frase da fala que contém o trecho (ignorando acento e caixa). Sem frase que contenha, a fala inteira. */
export function fraseComTrecho(texto: string, trecho: string): string {
  const alvo = normalizarTexto(trecho);
  return frasesDe(texto).find((f) => ` ${normalizarTexto(f)} `.includes(` ${alvo} `)) ?? texto.trim();
}

/** A primeira frase da fala que casa com a palavra-chave, se houver. */
export function fraseComPalavra(texto: string, palavra: RegExp): string | undefined {
  return frasesDe(texto).find((f) => palavra.test(f));
}

/** Palavras-chave das falas que mostram tom, dicas, eliminatório e contexto. */
/** Palavra de tom: só frase que tem uma delas pode ser citada como tom. "Não precisa muita pressão" não é tom. */
export const RE_TOM = /amig[aá]vel|tranquil|\bleve\b|desafiador|pressionar|questionar|\bduro\b|[aà] vontade/i;
export const RE_DICAS = /\bdicas?\b|que se vire/i;
export const RE_ELIMINATORIO = /eliminat|reprov|desclass/i;
/** Frase que descreve requisito ou experiência do candidato: não é contexto do time. */
export const RE_REQUISITO = /\b(experi[eê]ncia|vivenc\w*|saber|precisa|capacidade de|tem que ter|candidato\w*|ele)\b/i;
/** Contexto só vale se fala do time, da empresa, do produto, dos clientes ou do momento da contratação. */
export const RE_CONTEXTO = /\b(time|equipe|empresa|produto|clientes?|startup|pessoas|volume|momento|contrata\w*)\b/i;

/** Limite de palavras para trechos que vão para o guia. */
export function limitarPalavras(texto: string, max = 25): string {
  const palavras = texto.trim().split(/\s+/);
  return palavras.length <= max ? texto.trim() : `${palavras.slice(0, max).join(" ")}…`;
}

/** Palavras que ligam uma frase a cada área (para escolher a frase que disparou a ênfase). */
export const PALAVRAS_AREA: Record<"tecnico" | "pressao" | "escala_produto" | "uso_ia", RegExp> = {
  tecnico: /algoritm|c[oó]digo|estrutura[s]? de dados|implement|corretude|testes?/i,
  pressao: /press[aã]o|prazo|calma|travad|imprevist|urgent|estress|mudan[çc]a/i,
  escala_produto: /escal|falha|consist[eê]ncia|idempot|volume|cache|fila|banco|sistema|produto|confiabil|gargalo|complexidade/i,
  uso_ia: /\bIA\b|LLM|agente|modelo|RAG|prompt/i,
};

/**
 * A oração da fala que contém a palavra da área: corta por frase e depois por vírgula ou ponto e vírgula.
 * Sem oração que case com a área, undefined: não se cita a fala inteira.
 */
export function fraseDaArea(fala: string, area: keyof typeof PALAVRAS_AREA): string | undefined {
  const oracoes = frasesDe(fala).flatMap((f) =>
    f
      .split(/[,;]\s*/)
      .map((o) => o.trim())
      .filter(Boolean),
  );
  return oracoes.find((o) => PALAVRAS_AREA[area].test(o));
}

/** Frase de logística (minutos, duração, tom, dicas, clima): não serve de evidência de critério de competência. */
export const RE_LOGISTICA = /minutos?|dura[çc][ãa]o|\btom\b|\bdicas?\b|clima|desafi\w*|tranquil\w*|amig[aá]vel\w*/i;
/** Frase que descreve o candidato ideal (sujeito: ele, o candidato ou "tem que ter"): não é contexto do time. */
export const RE_SUJEITO_CANDIDATO = /\b(ele|candidato\w*|tem que ter)\b/i;
