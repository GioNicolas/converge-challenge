/** Registro dos kits. Só no servidor: nada daqui, além de dadosPublicosDoProblema, vai ao navegador. */
import { kitSemTermosInternos, type Kit, type Problema } from "./tipos";
import { KIT_SYSTEM_DESIGN } from "./system-design";
import { KIT_SYSTEM_DESIGN_IA } from "./system-design-ia";
import { KIT_DESIGN_PRODUTO } from "./design-produto";
import { repositorioAvaliacoesPadrao } from "./repositorio";

export const KITS: Record<string, Kit> = {
  [KIT_SYSTEM_DESIGN.id]: KIT_SYSTEM_DESIGN,
  [KIT_SYSTEM_DESIGN_IA.id]: KIT_SYSTEM_DESIGN_IA,
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
  "demo-chatbot-ia": { kitId: "system_design_ia", problemaId: "chatbot_atendimento_ia" },
  "demo-produto": { kitId: "design_produto", problemaId: "onboarding_60_mais" },
};

export type AvaliacaoResolvida = {
  kit: Kit;
  problema: Problema;
  /** true = avaliação gerada (repositório dinâmico); false = demo estática. */
  dinamica: boolean;
  /** Demos estáticas contam como aprovadas. */
  aprovado: boolean;
};

/** Só as demos estáticas (síncrono; usado pelo harness e por testes). */
export function resolverAvaliacaoEstatica(avaliacaoId: string): { kit: Kit; problema: Problema } | undefined {
  if (!Object.hasOwn(AVALIACOES, avaliacaoId)) return undefined;
  const { kitId, problemaId } = AVALIACOES[avaliacaoId];
  const kit = obterKit(kitId);
  const problema = obterProblema(kitId, problemaId);
  return kit && problema ? { kit, problema } : undefined;
}

/** Procura primeiro as avaliações geradas (dinâmicas) e depois as demos estáticas. */
export async function resolverAvaliacao(avaliacaoId: string): Promise<AvaliacaoResolvida | undefined> {
  const dinamica = await repositorioAvaliacoesPadrao().obter(avaliacaoId);
  if (dinamica) return { kit: kitSemTermosInternos(dinamica.kit), problema: dinamica.problema, dinamica: true, aprovado: dinamica.aprovado };
  const estatica = resolverAvaliacaoEstatica(avaliacaoId);
  return estatica ? { ...estatica, dinamica: false, aprovado: true } : undefined;
}

/** O único recorte do problema que pode sair do servidor (sem ficha, sinais, armadilhas ou rubrica). */
export function dadosPublicosDoProblema(
  problema: Problema,
): { titulo: string; enunciado: string; fala_do_desafio?: string } {
  const publico: { titulo: string; enunciado: string; fala_do_desafio?: string } = {
    titulo: problema.titulo,
    enunciado: problema.enunciado,
  };
  if (problema.falaDoDesafio?.trim()) publico.fala_do_desafio = problema.falaDoDesafio.trim();
  return publico;
}

/** Carrega um kit ESTÁTICO pelo id do kit ("system_design") ou da avaliação ("demo", "demo-produto"...). */
export function carregarKit(id: string): Kit | undefined {
  return resolverAvaliacaoEstatica(id)?.kit ?? obterKit(id);
}
