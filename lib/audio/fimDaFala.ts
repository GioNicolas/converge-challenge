/**
 * Quanto esperar de silêncio antes de mandar a fala do candidato ao Totti. Quem pensa em voz alta pausa no meio da
 * frase ("e aí eu colocaria... o cache"): mandar nessa pausa faz o Totti responder a meia ideia. Frase que termina
 * pendurada (conectivo, vírgula) espera mais; frase fechada ou pergunta segue rápido.
 */
const PENDURADA = /(,|\b(e|ent[ãa]o|a[ií]|porque|que|de|do|da|dos|das|pra|para|com|tipo|mas|ou|o|a|os|as|um|uma|no|na|nos|nas|se|quando|como|em|por|pelo|pela|tipo assim|sabe|né|hum+|hm+|é+|ah+|eh+))\s*$/i;

export const ESPERA_FRASE_FECHADA_MS = 1100;
export const ESPERA_FRASE_CURTA_MS = 1600;
export const ESPERA_FRASE_PENDURADA_MS = 2400;

export function esperaDoFimDaFala(texto: string): number {
  const t = texto.trim().replace(/[.…]+$/, "").trim();
  if (!t) return ESPERA_FRASE_FECHADA_MS;
  if (/\?\s*$/.test(texto.trim())) return ESPERA_FRASE_FECHADA_MS;
  if (PENDURADA.test(t)) return ESPERA_FRASE_PENDURADA_MS;
  if (t.split(/\s+/).length < 4) return ESPERA_FRASE_CURTA_MS;
  return ESPERA_FRASE_FECHADA_MS;
}
