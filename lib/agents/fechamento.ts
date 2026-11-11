import { uncoveredCriteria } from "@/lib/agents/coverage";
import { startClosing } from "@/lib/agents/policy";
import { aoVoltarATrabalhar } from "@/lib/totti/fechamento";
import type { PerguntaFinal } from "@/lib/totti/fechamento";
import type { SessionState } from "@/lib/session/types";
import type { EstadoFechamento } from "@/lib/totti/fechamento";
import type { SessionEvent } from "@/lib/contracts";

export const MIN_LINHAS_PARA_VOLTA = 3;
export const MIN_CARACTERES_PARA_VOLTA = 80;

/** Decide sem efeitos colaterais se um evento de código suspende o fechamento. */
export function linhasAlteradas(antes: string, depois: string): number {
  const a = antes.split("\n"); const b = depois.split("\n");
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => a[i] !== b[i]).filter(Boolean).length;
}

export function caracteresAlterados(antes: string, depois: string): number {
  let inicio = 0;
  while (inicio < antes.length && inicio < depois.length && antes[inicio] === depois[inicio]) inicio++;
  let fimA = antes.length - 1; let fimB = depois.length - 1;
  while (fimA >= inicio && fimB >= inicio && antes[fimA] === depois[fimB]) { fimA--; fimB--; }
  return Math.max(fimA - inicio + 1, fimB - inicio + 1);
}

export function voltouATrabalhar(estado: EstadoFechamento, evento: SessionEvent, codigoInicial: string): boolean {
  if (!["anuncio", "perguntas_finais", "ultima_palavra"].includes(estado.etapa)) return false;
  const codigo = evento.type === "snapshot" ? evento.code : undefined;
  const mudouMuito = codigo !== undefined && (linhasAlteradas(codigoInicial, codigo) >= MIN_LINHAS_PARA_VOLTA || caracteresAlterados(codigoInicial, codigo) >= MIN_CARACTERES_PARA_VOLTA);
  return mudouMuito && aoVoltarATrabalhar(estado) === null;
}

/** Reúne na ordem da política as perguntas prontas e os pontos pendentes do fechamento legado. */
export function candidatasDoFechamento(session: SessionState, t: number): PerguntaFinal[] {
  const elegiveis = session.queue.filter((q) => q.status === "queued" || q.status === "blipped");
  const copia: SessionState = { ...session, queue: elegiveis.map((q) => ({ ...q })), blips: [...session.blips], events: [...session.events], evidence: [...session.evidence], pendingBlipId: session.pendingBlipId };
  const blip = startClosing(copia, t);
  const closing = blip && copia.queue.find((q) => q.id === blip.id);
  if (!closing) return [];
  const candidatas: PerguntaFinal[] = [];
  const cola = copia.queue.find((q) => q.kind === "cola" && q.status === "stale");
  if (cola) candidatas.push({ pergunta: "Você colou esse trecho. De onde veio e como ele funciona?", origem: "colagem", apontar: cola.highlight });
  const prepared = copia.queue.filter((q) => q.kind !== "encerramento" && q.status === "stale" && q.kind !== "cola");
  for (const q of prepared) candidatas.push({ pergunta: q.question, origem: "analise", apontar: q.highlight });
  // Critérios descobertos pelo fechamento legado só viram pergunta quando existe pergunta preparada para eles.
  const idsCobertos = new Set(uncoveredCriteria(session));
  for (const q of elegiveis.filter((item) => item.criterionId && idsCobertos.has(item.criterionId) && item.question.trim())) {
    if (!candidatas.some((c) => c.pergunta === q.question)) candidatas.push({ pergunta: q.question, origem: "criterio", apontar: q.highlight });
  }
  return candidatas;
}
