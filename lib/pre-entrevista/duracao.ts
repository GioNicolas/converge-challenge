/**
 * Leitura da duração que a recrutadora disse, sem LLM: "60 minutos", "sessenta minutos", "45min", "uma hora",
 * "uma hora e meia", "meia hora", "quarenta e cinco". Funções puras.
 *
 * Um número sem unidade de tempo só vale quando a última pergunta do Totti foi sobre tempo, e fica dentro de
 * 5 a 300 minutos. Assim "3 milhões de transações" e "nível 2" não viram duração.
 */

const PALAVRAS_NUMERO: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
};

const PALAVRAS = Object.keys(PALAVRAS_NUMERO).join("|");
/** Um número: algarismos, ou por extenso até 199 ("sessenta", "quarenta e cinco", "cento e vinte"). */
const NUMERO = `(?:\\d+|(?:${PALAVRAS})(?:\\s+e\\s+(?:${PALAVRAS}))?)`;

const LIMITE_MIN = 5;
const LIMITE_MAX = 300;

/** Minúsculas, sem acento e com espaços simples. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Valor de um número escrito em algarismos ou por extenso (já normalizado). */
function valorDe(numero: string): number {
  if (/^\d+$/.test(numero)) return Number(numero);
  return numero.split(/\s+e\s+/).reduce((acc, palavra) => acc + PALAVRAS_NUMERO[palavra], 0);
}

function valida(minutos: number | undefined): number | undefined {
  return minutos !== undefined && minutos >= LIMITE_MIN && minutos <= LIMITE_MAX ? minutos : undefined;
}

/** A última fala do Totti perguntou sobre tempo ou duração? */
export function perguntouSobreTempo(textoAgente: string | undefined): boolean {
  if (!textoAgente) return false;
  const t = normalizar(textoAgente);
  // "Quanto tempo", não qualquer "tempo": "se o tempo acabar, o que conta mais?" é sobre o candidato, não sobre a duração.
  return t.includes("?") && /\b(minutos?|duracao|dura|durar)\b|\bquanto tempo\b/.test(t);
}

/**
 * Duração em minutos dita na fala, ou undefined. Com unidade (min, minuto, hora) sempre vale;
 * sem unidade, só se o Totti tiver perguntado sobre tempo (`contexto.perguntouTempo`).
 */
export function lerDuracao(texto: string, contexto: { perguntouTempo?: boolean } = {}): number | undefined {
  const t = normalizar(texto);
  const horaEMeia = t.match(new RegExp(`\\b(${NUMERO})\\s+horas?\\s+e\\s+meia\\b`));
  if (horaEMeia) return valida(valorDe(horaEMeia[1]) * 60 + 30);
  if (/\buma hora e meia\b/.test(t)) return 90;
  if (/\bmeia hora\b/.test(t)) return 30;

  const minutos = t.match(new RegExp(`\\b(${NUMERO})\\s*(?:minutos?|mins?)\\b`));
  if (minutos) return valida(valorDe(minutos[1]));

  const horas = t.match(new RegExp(`\\b(${NUMERO})\\s*horas?\\b`));
  if (horas) return valida(valorDe(horas[1]) * 60);

  if (contexto.perguntouTempo) {
    // Porcentagem não é duração ("não precisa estar 100% funcionando").
    const numero = t.match(new RegExp(`\\b(${NUMERO})\\b(?!\\s*(?:%|por cento))`));
    if (numero) return valida(valorDe(numero[1]));
  }
  return undefined;
}
