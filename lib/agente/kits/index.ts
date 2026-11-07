/** Registro dos kits. Só no servidor: nada daqui, além de dadosPublicosDoProblema, vai ao navegador. */
import type { Kit, Problema } from "./tipos";
import { KIT_SYSTEM_DESIGN } from "./system-design";
import { KIT_DESIGN_PRODUTO } from "./design-produto";

export const KITS: Record<string, Kit> = {
  [KIT_SYSTEM_DESIGN.id]: KIT_SYSTEM_DESIGN,
  [KIT_DESIGN_PRODUTO.id]: KIT_DESIGN_PRODUTO,
};

export function obterKit(id: string): Kit | undefined {
  return Object.hasOwn(KITS, id) ? KITS[id] : undefined;
}

export function obterProblema(kitId: string, problemaId: string): Problema | undefined {
  return obterKit(kitId)?.problemas.find((p) => p.id === problemaId);
}

/** Avaliações de demonstração: id da avaliação -> kit + problema. */
const AVALIACOES: Record<string, { kitId: string; problemaId: string }> = {
  demo: { kitId: "system_design", problemaId: "encurtador_url" },
  "demo-chat": { kitId: "system_design", problemaId: "chat_tempo_real" },
  "demo-pagamentos": { kitId: "system_design", problemaId: "pagamentos_instantaneos" },
  "demo-produto": { kitId: "design_produto", problemaId: "onboarding_60_mais" },
};

export function resolverAvaliacao(avaliacaoId: string): { kit: Kit; problema: Problema } | undefined {
  if (!Object.hasOwn(AVALIACOES, avaliacaoId)) return undefined;
  const { kitId, problemaId } = AVALIACOES[avaliacaoId];
  const kit = obterKit(kitId);
  const problema = obterProblema(kitId, problemaId);
  return kit && problema ? { kit, problema } : undefined;
}

/** O único recorte do problema que pode sair do servidor (sem ficha, sinais, armadilhas ou rubrica). */
export function dadosPublicosDoProblema(problema: Problema): { titulo: string; enunciado: string } {
  return { titulo: problema.titulo, enunciado: problema.enunciado };
}
