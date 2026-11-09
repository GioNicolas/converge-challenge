/**
 * Pedido de licença para interromper (quadro e live coding): com o candidato no meio do desenho ou do código, o
 * Totti não corta com a pergunta; pergunta antes se pode perguntar, e a resposta dele decide.
 */

/** Sem resposta ao pedido de licença: ele está concentrado, a pergunta fica para depois. */
export const LICENCA_SEM_RESPOSTA_MS = 10_000;
/** Ele pediu para esperar (ou não respondeu): não pede licença de novo antes disso. */
export const LICENCA_DE_NOVO_MS = 45_000;

/** "Espera", "agora não", "só um minuto": a pergunta fica para depois. */
const ESPERA = /\b(espera|espere|pera|peraí|perai|agora n[ãa]o|n[ãa]o agora|ainda n[ãa]o|s[óo] um (minuto|minutinho|segundo|segundinho|pouco|pouquinho|instante)|um (minuto|minutinho|segundo|instante)|daqui a pouco|depois|calma|aguenta)\b/i;
/** Liberou de forma explícita ("pode falar", "manda"): vale mesmo que a frase tenha um "depois" no meio. */
const PODE = /\b(pode (falar|perguntar|mandar)|manda|claro|sim|fala a[íi]|pode sim)\b/i;

/** A resposta ao pedido de licença: true pode perguntar, false é para esperar. */
export function liberouAPergunta(fala: string): boolean {
  if (PODE.test(fala)) return true;
  return !ESPERA.test(fala) && !/^\s*n[ãa]o\b/i.test(fala);
}
