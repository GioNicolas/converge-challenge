/**
 * Os critérios que uma regra da squad pode afetar. São os do catálogo da pré-entrevista
 * (`lib/pre-entrevista/catalogo.ts`) nos dois formatos; `equivalentes` liga os ids da rubrica de
 * system design do cérebro (`lib/agente/kits/rubrica-system-design.ts`), que usa outros nomes.
 */
import type { RegraSquad } from "./tipos";

export interface CriterioSquad {
  id: string;
  nome: string;
  /** Ids de outras rubricas que medem a mesma coisa. */
  equivalentes: string[];
}

export const CRITERIOS_SQUAD: CriterioSquad[] = [
  { id: "abordagem", nome: "Entendimento e abordagem", equivalentes: [] },
  { id: "complexidade", nome: "Complexidade", equivalentes: [] },
  { id: "corretude", nome: "Corretude e código", equivalentes: [] },
  { id: "bordas", nome: "Casos de borda", equivalentes: [] },
  { id: "comunicacao", nome: "Comunicação", equivalentes: [] },
  { id: "pressao_adaptacao", nome: "Pressão e adaptação", equivalentes: [] },
  { id: "requisitos", nome: "Requisitos e escopo", equivalentes: [] },
  { id: "estimativa", nome: "Estimativa de escala", equivalentes: ["escalabilidade"] },
  { id: "componentes", nome: "Componentes e dados", equivalentes: ["componentes_fluxo", "dados_consistencia"] },
  { id: "tradeoffs", nome: "Trade-offs", equivalentes: [] },
  { id: "gargalos_falhas", nome: "Gargalos e falhas", equivalentes: ["escalabilidade"] },
  { id: "uso_ia_criterio", nome: "Solução com IA", equivalentes: [] },
];

const POR_ID = new Map(CRITERIOS_SQUAD.map((c) => [c.id, c]));

export function criterioValido(id: string): boolean {
  return POR_ID.has(id) || CRITERIOS_SQUAD.some((c) => c.equivalentes.includes(id));
}

export function nomeDoCriterio(id: string): string {
  return POR_ID.get(id)?.nome ?? CRITERIOS_SQUAD.find((c) => c.equivalentes.includes(id))?.nome ?? id;
}

/** A regra pesa nesse critério da rubrica? Vale o mesmo id ou um equivalente. */
export function regraAfeta(regra: Pick<RegraSquad, "criterio">, criterioId: string): boolean {
  if (regra.criterio === criterioId) return true;
  const daRegra = POR_ID.get(regra.criterio);
  if (daRegra?.equivalentes.includes(criterioId)) return true;
  return POR_ID.get(criterioId)?.equivalentes.includes(regra.criterio) ?? false;
}
