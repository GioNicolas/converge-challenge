import type { SessionEvent } from "@/lib/contracts";
import type { SessionState } from "@/lib/session/types";

/** Eventos de contabilidade gravados pelo servidor: não são ação do candidato nem da IDE. */
export const TIPOS_DE_USO: ReadonlySet<SessionEvent["type"]> = new Set(["llm_uso", "transcricao_uso", "voz_uso", "voz_descartada"]);

/** Último evento da entrevista em si (ignora os de uso, que chegam a qualquer hora). */
export function ultimoEvento(session: SessionState): SessionEvent | undefined {
  for (let i = session.events.length - 1; i >= 0; i--) if (!TIPOS_DE_USO.has(session.events[i].type)) return session.events[i];
  return undefined;
}
