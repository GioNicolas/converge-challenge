// Repositório das avaliações GERADAS em cima do `Kv` (Supabase em produção, memória nos testes).
// Uma linha por avaliação: avaliacao / <avaliacaoId> -> { kit, problema, aprovado, ... }.
import type { Kv } from "@/lib/storage/kv";
import type { RegistroAvaliacao, RepositorioAvaliacoes } from "./repositorio";

const NS = "avaliacao";
const ID_VALIDO = /^[A-Za-z0-9_-]{1,200}$/;

export function criarRepositorioAvaliacoesKv(kv: Kv): RepositorioAvaliacoes {
  const ler = async (id: string) => (ID_VALIDO.test(id) ? kv.get<RegistroAvaliacao>(NS, id) : null);
  return {
    async criar(r) {
      if (!ID_VALIDO.test(r.avaliacaoId)) throw new Error("avaliacaoId inválido");
      const reg: RegistroAvaliacao = { ...r, criadoEm: r.criadoEm ?? Date.now(), aprovado: false };
      await kv.set(NS, r.avaliacaoId, reg);
      return structuredClone(reg);
    },
    async obter(id) {
      return (await ler(id)) ?? undefined;
    },
    async substituirKit(id, kit, problema) {
      const r = await ler(id);
      if (!r) return undefined;
      const novo: RegistroAvaliacao = { ...r, kit: structuredClone(kit), problema: structuredClone(problema), aprovado: false };
      await kv.set(NS, id, novo);
      return novo;
    },
    async aprovar(id) {
      const r = await ler(id);
      if (!r) return undefined;
      const novo: RegistroAvaliacao = { ...r, aprovado: true };
      await kv.set(NS, id, novo);
      return novo;
    },
  };
}
