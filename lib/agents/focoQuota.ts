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

/** Quantas perguntas de foco da área estão valendo (na fila, abertas ou feitas). Ignoradas e obsoletas não contam. */
function jaPerguntadas(session: SessionState, area: FocusArea): number {
  return session.queue.filter((q) => q.focusArea === area && q.status !== "stale" && q.status !== "ignored").length;
}

/** Quantas já foram geradas, valendo ou não: o teto evita a mesma pergunta voltando a cada análise. */
function geradas(session: SessionState, area: FocusArea): number {
  return session.queue.filter((q) => q.focusArea === area).length;
}

/** Máximo de tentativas de pergunta de foco por área na sessão (uma que ficou velha pode voltar uma vez). */
const MAX_GERADAS_POR_AREA = 2;
/** Na reta final, qualquer foco ainda pendente vale. */
const RETA_FINAL_MS = 8 * 60_000;
/** Parado sem mexer no código há esse tempo, sem a solução funcionando: provável travada. */
const PARADO_MS = 60_000;

/**
 * O momento em que a pergunta do foco faz sentido para o candidato. Fora dele, a pergunta soa solta ("como você
 * divide o seu tempo?" logo depois de ele começar a codar).
 * - pressão: quando o código está falhando seguido, quando ele parou, ou na reta final;
 * - uso de IA: depois de uma colagem, ou com a solução já funcionando;
 * - escala: com a solução já funcionando.
 */
function momentoDoFoco(session: SessionState, area: FocusArea, t: number): boolean {
  if (session.config.durationMin * 60_000 - t <= RETA_FINAL_MS) return true;
  const runs = session.events.filter((e) => e.type === "run");
  const funcionou = runs.some((e) => e.type === "run" && e.result.total > 0 && e.result.passed === e.result.total);
  if (area === "escala_produto") return funcionou;
  if (area === "uso_ia") return funcionou || session.events.some((e) => e.type === "paste");
  if (area === "pressao") {
    const falhasSeguidas = [...runs].reverse().findIndex((e) => e.type === "run" && e.result.total > 0 && e.result.passed === e.result.total);
    const seguidas = falhasSeguidas === -1 ? runs.length : falhasSeguidas;
    const ultimaMudanca = session.codeHistory.at(-1)?.t ?? 0;
    return seguidas >= 2 || (!funcionou && session.codeHistory.length > 1 && t - ultimaMudanca >= PARADO_MS);
  }
  return false;
}

/** Foco mais pesado que ainda não teve sua pergunta e está no momento dela, ou undefined. */
export function focoPendente(session: SessionState, t = session.events.at(-1)?.t ?? 0): FocusArea | undefined {
  return session.config.focus
    .filter((f) => f.weight > 0 && AREAS_DE_PROCESSO.includes(f.area))
    .filter((f) => jaPerguntadas(session, f.area) < MAX_POR_AREA && geradas(session, f.area) < MAX_GERADAS_POR_AREA)
    .filter((f) => momentoDoFoco(session, f.area, t))
    .sort((a, b) => b.weight - a.weight)[0]?.area;
}
