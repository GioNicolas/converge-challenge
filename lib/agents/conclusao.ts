/**
 * "Terminei" do candidato no live coding: a fala que avisa que ele acabou. Puro (sem servidor), porque a IDE também
 * usa: a fala curta "terminei" precisa ir para a linha do tempo, senão o segundo "terminei", noutra conversa, não
 * sabia do primeiro.
 */

/** Terminei, acabei, finalizei, concluí. "Acabei de mudar", "terminei essa parte" e "não terminei" não são o fim. */
const TERMINOU = /(?<!n[ãa]o\s+)\b(terminei|acabei|finalizei|conclu[íi])(?![\wà-ú])(?!\s+(de|d[aeo]s?|ess[ae]s?|est[ae]s?|a primeira|o primeiro|uma|um|s[óo] (ess|est|a primeira|o primeiro)))/i;

/** A fala diz que ele terminou a solução (não uma etapa nem uma ação recente). */
export function disseQueTerminou(texto: string): boolean {
  return TERMINOU.test(texto);
}

/** Diz que já tinha terminado ("já terminei"): reforço de quem já avisou antes. */
export function disseQueJaTerminou(texto: string): boolean {
  return disseQueTerminou(texto) && /\bj[áa]\b/i.test(texto);
}
