export * from "./repositorio";
import { arquivosPadrao } from "@/lib/storage/arquivos";
import { kvRemoto } from "@/lib/storage/kv";
import { criarRepositorioKv } from "./kv";
import { repositorioEmMemoriaPadrao } from "./memoria";
import type { RepositorioSessoes } from "./repositorio";

export { criarRepositorioEmMemoria, LIMITES_PADRAO } from "./memoria";
export { criarRepositorioKv } from "./kv";

const CHAVE_KV = Symbol.for("convergechallenge.repositorioSessoesKv");

/**
 * O repositório das sessões: no Supabase quando configurado (vale entre instâncias e reinícios),
 * senão em memória (desenvolvimento e testes).
 */
export function repositorioPadrao(): RepositorioSessoes {
  const kv = kvRemoto();
  if (!kv) return repositorioEmMemoriaPadrao();
  const g = globalThis as unknown as Record<symbol, RepositorioSessoes | undefined>;
  return (g[CHAVE_KV] ??= criarRepositorioKv(kv, arquivosPadrao()));
}
