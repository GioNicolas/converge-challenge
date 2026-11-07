/**
 * Cota de perguntas por foco da vaga. O foco "técnico" já é coberto pelas perguntas sobre o código;
 * os outros (pressão, escala, uso de IA) pedem uma pergunta própria, de processo, senão o modelo
 * só pergunta sobre o código e o foco definido pela recrutadora não aparece na entrevista.
 *
 * Quem decide qual foco está pendente é o código (aqui), não o LLM: assim a distribuição segue os pesos
 * e não varia de uma execução para outra.
 */
import type { FocusArea } from "@/lib/contracts";
import type { SessionState } from "@/lib/session/types";

/** Áreas que precisam de pergunta própria. */
const AREAS_DE_PROCESSO: FocusArea[] = ["escala_produto", "pressao", "uso_ia"];
/** Máximo de perguntas de foco por área na sessão. */
const MAX_POR_AREA = 1;
/** Prioridade das perguntas de foco: acima do limiar de blip, abaixo da que pula o espaçamento. */
export const PRIORIDADE_FOCO = 0.75;

/** Quantas perguntas de foco da área já existem (na fila, abertas ou feitas). Ignoradas e obsoletas não contam. */
function jaPerguntadas(session: SessionState, area: FocusArea): number {
  return session.queue.filter((q) => q.focusArea === area && q.status !== "stale" && q.status !== "ignored").length;
}

/** Foco mais pesado que ainda não teve sua pergunta, ou undefined se não há (ou o foco só é técnico). */
export function focoPendente(session: SessionState): FocusArea | undefined {
  return session.config.focus
    .filter((f) => f.weight > 0 && AREAS_DE_PROCESSO.includes(f.area) && jaPerguntadas(session, f.area) < MAX_POR_AREA)
    .sort((a, b) => b.weight - a.weight)[0]?.area;
}
