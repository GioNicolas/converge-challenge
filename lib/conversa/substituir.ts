/**
 * A fala do candidato que substitui a anterior (ver lib/audio/filaFalas.ts): ele continuou falando antes de
 * ouvir a resposta, e as duas partes chegam juntas. A fala anterior e a resposta que ele nunca ouviu saem do
 * histórico, para o agente não achar que disse algo que não disse nem ler a mesma fala duas vezes.
 */
type Fala = { quem: string; texto: string };

const normalizar = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/** O histórico sem a última fala do candidato (e o que veio depois dela) quando `texto` a contém no começo. */
export function semFalaSubstituida<T extends Fala>(conversa: T[], texto: string): T[] {
  const i = conversa.findLastIndex((f) => f.quem === "candidato");
  if (i < 0) return conversa;
  if (conversa.slice(i + 1).some((f) => f.quem === "candidato")) return conversa;
  const anterior = normalizar(conversa[i].texto);
  if (!anterior || !normalizar(texto).startsWith(anterior)) return conversa;
  return conversa.slice(0, i);
}
