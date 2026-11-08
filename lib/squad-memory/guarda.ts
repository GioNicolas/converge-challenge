/**
 * Guarda-corpo contra viés: o Totti só aprende critério técnico. Idade, formação, gênero, origem,
 * aparência e afins nunca viram regra, e o Tech Lead fica sabendo que aquilo foi ignorado.
 *
 * Roda ANTES do modelo (o trecho nem chega a ele) e DEPOIS (regra que o modelo escreveu com esses
 * termos é descartada). Determinístico de propósito: não depende do modelo para proteger o candidato.
 */

interface Categoria {
  porque: string;
  re: RegExp;
}

// \b não funciona bem com acento em JS; usamos limites explícitos.
const L = "(?:^|[^\\p{L}\\p{N}])";
const R = "(?=$|[^\\p{L}\\p{N}])";
const termos = (lista: string) => new RegExp(`${L}(?:${lista})${R}`, "iu");
const prefixos = (lista: string) => new RegExp(`${L}(?:${lista})`, "iu");

const CATEGORIAS: Categoria[] = [
  {
    porque: "idade não é critério técnico",
    re: termos("idade|velh[oa] demais|muito velh[oa]|velh[oa] para|velhinh[oa]|jovem demais|nov[oa] demais|muito nov[oa]|\\d{2} anos de idade|gera[cç][aã]o z|boomer|coroa"),
  },
  {
    porque: "formação ou faculdade não é critério técnico",
    re: termos("faculdade|universidade|diploma|graduad[oa]|curso superior|usp|unicamp|ita|puc|bootcamp|forma[cç][aã]o acad[eê]mica"),
  },
  {
    porque: "gênero e vida pessoal não são critérios técnicos",
    re: termos("mulher|homem|g[eê]nero|gr[aá]vida|gravidez|tem filhos?|filhos pequenos|maternidade|paternidade|casad[oa]|solteir[oa]|namorad[oa]"),
  },
  {
    porque: "sotaque e origem não são critérios técnicos",
    re: prefixos("sotaque|nordestin|baian|paulist|carioc|mineir|gaúch|gauch|gringo|estrangeir|nacionalidade|regionalismo|imigrante"),
  },
  {
    porque: "aparência não é critério técnico",
    re: prefixos("apar[eê]ncia|bonit|feio|feia|gord|magr|tatuag|cabelo|barba|piercing|roupa|se veste|visual dele|visual dela"),
  },
  {
    porque: "raça e religião não são critérios técnicos",
    re: prefixos("ra[cç]a|cor da pele|negr|branc[oa] demais|religi|igreja|evang[eé]lic|cat[oó]lic|macumb|umband|candombl"),
  },
  {
    porque: "deficiência ou saúde não são critérios técnicos",
    re: prefixos("defici[eê]n|cadeira de rodas|autis|tdah|doen[cç]a|depress"),
  },
  {
    porque: "impressão pessoal não é critério técnico",
    re: termos("fit cultural|n[aã]o tem fit|sem fit|simpatia|antip[aá]tic[oa]|n[aã]o fui com a cara|n[aã]o gostei dele|n[aã]o gostei dela|jeit[oa] dele|jeit[oa] dela|personalidade"),
  },
];

/** Por que o trecho não pode virar regra, ou undefined se ele é aceitável. */
export function motivoNaoTecnico(trecho: string): string | undefined {
  return CATEGORIAS.find((c) => c.re.test(trecho))?.porque;
}

/**
 * Quebra o motivo em trechos (frases e orações ligadas por "e porque", "mas", "além disso"), para
 * descartar só a parte não técnica: "propôs Kafka sem necessidade e é muito velho" salva a primeira.
 */
export function dividirEmTrechos(motivo: string): string[] {
  return motivo
    .split(/[.;!?\n]+|,?\s+(?:mas|al[eé]m disso|tamb[eé]m|e\s+(?:tamb[eé]m\s+)?(?:porque|que|ele|ela|achei|era|[eé]))\s+/iu)
    .map((t) => t.trim().replace(/^(e|mas|,)\s+/i, ""))
    .filter((t) => t.length > 2);
}

export interface Triagem {
  /** Trechos técnicos (ou neutros) que podem ir ao extrator. */
  aceitos: string[];
  /** Trechos descartados, com o porquê. */
  ignorados: { trecho: string; porque: string }[];
}

/** Separa o que o Totti pode aprender do que ele deve ignorar. Função pura. */
export function triarMotivo(motivo: string): Triagem {
  const aceitos: string[] = [];
  const ignorados: Triagem["ignorados"] = [];
  for (const trecho of dividirEmTrechos(motivo)) {
    const porque = motivoNaoTecnico(trecho);
    if (porque) ignorados.push({ trecho, porque });
    else aceitos.push(trecho);
  }
  return { aceitos, ignorados };
}
