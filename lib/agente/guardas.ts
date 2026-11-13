// Guardas do quadro. As travas da fala do Totti (eco, validação, cumprimento, reação repetida, pergunta repetida,
// convite) moram em `lib/totti/guardas.ts` e valem nas duas salas; daqui elas são só reexportadas, para os imports
// antigos seguirem valendo. Fica aqui só o que é do quadro: os ids do grafo.
import * as totti from "../totti/guardas";

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
 * Nome de cada peça do grafo pelo id ("r5" → "Cache Redis"). Setas e linhas ficam de fora (não têm nome). Chave minúscula.
 * Também usada pelo prompt da análise (#129, bloco J): o assunto perguntado sai com o nome que o candidato vê.
 */
export function nomesDasPecas(grafo: string): Map<string, string> {
  const nomes = new Map<string, string>();
  for (const linha of grafo.split("\n")) {
    const m = linha.match(/^\s*-\s*\[([a-z]\d+)\]\s+(.+?)(?:\s+\((?:retângulo|elipse|losango|texto|moldura|imagem|desenho)[^)]*\))?\s*(?:—.*)?$/i);
    if (m && !/[→—]/.test(m[2])) nomes.set(m[1].toLowerCase(), m[2].replace(/^"|"$/g, "").trim());
  }
  return nomes;
}

/**
 * Troca ids do grafo ("[r5]", "o r5") pelo nome do elemento ("Cache Redis") numa fala. O modelo às vezes fala
 * o id, que não significa nada para quem ouve. Sem nome conhecido, o id sai e fica "esse elemento".
 */
export function trocarIdsPorNomes(texto: string, grafo: string): string {
  const nomes = nomesDasPecas(grafo);
  return texto
    .replace(/\[([a-z]\d+)\]/gi, (_, id: string) => nomes.get(id.toLowerCase()) ?? "esse elemento")
    .replace(/\b([a-z]\d+)\b/g, (todo, id: string) => nomes.get(id) ?? todo)
    .replace(/\s{2,}/g, " ")
    .trim();
}

// O fim da entrevista (anúncio, perguntas finais, última palavra, despedida) é o fechamento comum:
// lib/totti/fechamento.ts, ligado ao quadro em lib/agente/perguntar.ts.
export { aceitaEncerrar } from "../totti/fechamento";
