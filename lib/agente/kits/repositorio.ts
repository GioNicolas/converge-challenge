/**
 * Repositório das avaliações GERADAS (dinâmicas): avaliacaoId -> kit + problema + aprovação.
 * Só no servidor. Em memória, singleton em globalThis (sobrevive ao hot reload do Next, como o
 * repositório de sessões). Trocar por banco = outra implementação da interface.
 */
import { kvRemoto } from "@/lib/storage/kv";
import { criarRepositorioAvaliacoesKv } from "./repositorio-kv";
import type { Kit, Problema } from "./tipos";

export type RegistroAvaliacao = {
  avaliacaoId: string;
  kit: Kit;
  problema: Problema;
  vagaId: string;
  criadoEm: number;
  /** Uma pessoa (tech lead / gestor da área) revisou e aprovou o kit. */
  aprovado: boolean;
};

export interface RepositorioAvaliacoes {
  criar(r: Omit<RegistroAvaliacao, "aprovado" | "criadoEm"> & { criadoEm?: number }): Promise<RegistroAvaliacao>;
  obter(avaliacaoId: string): Promise<RegistroAvaliacao | undefined>;
  /** Troca o kit (edição humana). Remove a aprovação: o kit novo precisa ser aprovado de novo. */
  substituirKit(avaliacaoId: string, kit: Kit, problema: Problema): Promise<RegistroAvaliacao | undefined>;
  aprovar(avaliacaoId: string): Promise<RegistroAvaliacao | undefined>;
}

const MAX_AVALIACOES = 5000;

export function criarRepositorioAvaliacoesEmMemoria(): RepositorioAvaliacoes {
  const mapa = new Map<string, RegistroAvaliacao>();
  const copia = (r: RegistroAvaliacao): RegistroAvaliacao => structuredClone(r);
  return {
    async criar(r) {
      if (mapa.size >= MAX_AVALIACOES) {
        // Descarta a mais antiga (Map preserva a ordem de inserção).
        const primeira = mapa.keys().next().value;
        if (primeira !== undefined) mapa.delete(primeira);
      }
      const reg: RegistroAvaliacao = { ...r, criadoEm: r.criadoEm ?? Date.now(), aprovado: false };
      mapa.set(r.avaliacaoId, structuredClone(reg));
      return copia(reg);
    },
    async obter(id) {
      const r = mapa.get(id);
      return r ? copia(r) : undefined;
    },
    async substituirKit(id, kit, problema) {
      const r = mapa.get(id);
      if (!r) return undefined;
      const novo: RegistroAvaliacao = { ...r, kit: structuredClone(kit), problema: structuredClone(problema), aprovado: false };
      mapa.set(id, novo);
      return copia(novo);
    },
    async aprovar(id) {
      const r = mapa.get(id);
      if (!r) return undefined;
      r.aprovado = true;
      return copia(r);
    },
  };
}

const CHAVE = Symbol.for("convergechallenge.repositorioAvaliacoes");

export function repositorioAvaliacoesPadrao(): RepositorioAvaliacoes {
  const g = globalThis as unknown as Record<symbol, RepositorioAvaliacoes | undefined>;
  // No Supabase quando configurado (vale entre instâncias e reinícios); senão em memória.
  const kv = kvRemoto();
  return (g[CHAVE] ??= kv ? criarRepositorioAvaliacoesKv(kv) : criarRepositorioAvaliacoesEmMemoria());
}

/** Só para testes: troca (ou limpa, com null) o singleton. */
export function definirRepositorioAvaliacoesParaTestes(r: RepositorioAvaliacoes | null): void {
  const g = globalThis as unknown as Record<symbol, RepositorioAvaliacoes | undefined>;
  if (r) g[CHAVE] = r;
  else delete g[CHAVE];
}
