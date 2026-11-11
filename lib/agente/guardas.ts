// Guardas do quadro. As travas da fala do Totti (eco, validação, cumprimento, reação repetida, pergunta repetida,
// convite) moram em `lib/totti/guardas.ts` e valem nas duas salas; daqui elas são só reexportadas, para os imports
// antigos seguirem valendo. Fica aqui só o que é do quadro: os ids do grafo e a oferta de encerrar (até a #96).
import * as totti from "../totti/guardas";
import { normalizar } from "../totti/texto";

export { eQuaseDuplicada, frasesDe, LIMIAR_DUPLICADA, limitarFrases, normalizar, sobreposicao } from "../totti/texto";
export { aplicarGuardas, devolveAVez, eSoReacao, LIMIAR_PERGUNTA_REPETIDA, perguntaDeConducao, perguntaJaFeita, PROXIMO_PASSO, semEcoNoComeco, type ContextoDaFala, type Trava } from "../totti/guardas";

/** O convite para seguir que o Totti ainda não usou nas falas recentes, com o texto do quadro ("com o desenho"). */
export const escolherConvite = (texto: string, jaDitas: string[] = []) => totti.escolherConvite(texto, jaDitas, "quadro");
/** A fala com um convite curto no fim, quando ela não devolve a vez. */
export const comVezDevolvida = (texto: string, jaDitas: string[] = []) => totti.comVezDevolvida(texto, jaDitas, "quadro");
/** A fala sem a pergunta do fim, com um convite no lugar. */
export const semPerguntaNoFim = (texto: string, jaDitas: string[] = []) => totti.semPerguntaNoFim(texto, jaDitas, "quadro");
/** Como `semPerguntaNoFim`, mas o convite só entra se não sobrar fala. */
export const semPerguntaNoFimV2 = (texto: string) => totti.semPerguntaNoFimSeSobrar(texto, "quadro");

/**
 * Troca ids do grafo ("[r5]", "o r5") pelo nome do elemento ("Cache Redis") numa fala. O modelo às vezes fala
 * o id, que não significa nada para quem ouve. Sem nome conhecido, o id sai e fica "esse elemento".
 */
export function trocarIdsPorNomes(texto: string, grafo: string): string {
  const nomes = new Map<string, string>();
  for (const linha of grafo.split("\n")) {
    const m = linha.match(/^\s*-\s*\[([a-z]\d+)\]\s+(.+?)(?:\s+\((?:retângulo|elipse|losango|texto|moldura|imagem|desenho)[^)]*\))?\s*(?:—.*)?$/i);
    if (m && !/[→—]/.test(m[2])) nomes.set(m[1].toLowerCase(), m[2].replace(/^"|"$/g, "").trim());
  }
  return texto
    .replace(/\[([a-z]\d+)\]/gi, (_, id: string) => nomes.get(id.toLowerCase()) ?? "esse elemento")
    .replace(/\b([a-z]\d+)\b/g, (todo, id: string) => nomes.get(id) ?? todo)
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** O que o Totti diz quando o candidato já disse mais de uma vez que terminou e não há mais pergunta: oferece fechar. */
export const OFERTA_DE_ENCERRAR = "Por mim, a gente pode encerrar por aqui. Quer acrescentar alguma coisa antes, ou posso encerrar?";

/** Resposta curta à oferta de encerrar que não traz assunto novo ("nada", "pode", "não quero", "já falei tudo"). */
export function aceitaEncerrar(fala: string): boolean {
  const t = normalizar(fala);
  if (!t) return false;
  if (/\b(encerr\w*|finaliz\w*|fech\w*)\b/.test(t)) return true;
  if (t.split(" ").length > 8) return false;
  return /^(nada|nao|pode|sim|isso|so isso|e isso|ok|beleza|tranquilo|claro|quero nao|por mim)\b/.test(t) || /\b(nada|ja falei|terminei|acabei|e isso)\b/.test(t);
}
