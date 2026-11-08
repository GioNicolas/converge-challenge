// Armazenamento chave-valor (JSON) compartilhado por todo o servidor. Só servidor.
//
// Com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY usa a tabela `kv` do Supabase (pelo REST, sem dependência nova),
// então o dado vale entre instâncias e reinícios (Vercel). Sem elas, usa memória (testes e dev sem Supabase).
// A chave de serviço só existe no servidor; a tabela tem RLS ligado e nenhuma política, então só ela acessa.
//
// Tabela esperada (ver docs/supabase.md):  kv(namespace text, key text, value jsonb, updated_at timestamptz,
// primary key (namespace, key)).

export type RegistroKv<T = unknown> = { key: string; value: T; updatedAt: number };

export interface Kv {
  readonly nome: "supabase" | "memoria";
  get<T = unknown>(namespace: string, key: string): Promise<T | null>;
  /** Grava (substitui se já existir). */
  set(namespace: string, key: string, value: unknown): Promise<void>;
  /** Grava só se a chave não existir. Devolve true se gravou. */
  setIfAbsent(namespace: string, key: string, value: unknown): Promise<boolean>;
  /** Todos os registros do namespace, do mais antigo para o mais novo (por atualização). */
  list<T = unknown>(namespace: string): Promise<RegistroKv<T>[]>;
  delete(namespace: string, key: string): Promise<void>;
}

/** Falha de infraestrutura (rede, Supabase fora do ar, chave errada). Nunca carrega a chave nem o valor. */
export class ErroKv extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
    this.name = "ErroKv";
  }
}

function conferir(namespace: string, key: string): void {
  if (!namespace || namespace.length > 120) throw new ErroKv("namespace inválido");
  if (!key || key.length > 400) throw new ErroKv("chave inválida");
}

// ---------------------------------------------------------------------------------------------
// Memória
// ---------------------------------------------------------------------------------------------

export function criarKvEmMemoria(): Kv {
  const dados = new Map<string, Map<string, { value: unknown; seq: number }>>();
  let seq = 0;
  const ns = (n: string) => {
    let m = dados.get(n);
    if (!m) dados.set(n, (m = new Map()));
    return m;
  };
  return {
    nome: "memoria",
    async get<T>(namespace: string, key: string) {
      conferir(namespace, key);
      const r = ns(namespace).get(key);
      return r ? (structuredClone(r.value) as T) : null;
    },
    async set(namespace, key, value) {
      conferir(namespace, key);
      ns(namespace).set(key, { value: structuredClone(value), seq: ++seq });
    },
    async setIfAbsent(namespace, key, value) {
      conferir(namespace, key);
      const m = ns(namespace);
      if (m.has(key)) return false;
      m.set(key, { value: structuredClone(value), seq: ++seq });
      return true;
    },
    async list<T>(namespace: string) {
      const m = dados.get(namespace);
      if (!m) return [];
      return [...m.entries()]
        .sort((a, b) => a[1].seq - b[1].seq)
        .map(([key, r]) => ({ key, value: structuredClone(r.value) as T, updatedAt: r.seq }));
    },
    async delete(namespace, key) {
      conferir(namespace, key);
      dados.get(namespace)?.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Supabase (PostgREST)
// ---------------------------------------------------------------------------------------------

const PRAZO_MS = 10_000;
const PAGINA = 1000;

export function criarKvSupabase(opcoes: { url: string; chave: string }): Kv {
  const base = `${opcoes.url.replace(/\/+$/, "")}/rest/v1/kv`;
  const cabecalhos = (extra: Record<string, string> = {}) => ({
    apikey: opcoes.chave,
    Authorization: `Bearer ${opcoes.chave}`,
    "Content-Type": "application/json",
    ...extra,
  });

  /** Uma tentativa extra em erro de rede, 429 ou 5xx. */
  async function pedir(caminho: string, init: RequestInit): Promise<Response> {
    let ultimo: unknown;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const r = await fetch(`${base}${caminho}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(PRAZO_MS) });
        if (r.status === 429 || r.status >= 500) {
          ultimo = new ErroKv(`Supabase respondeu ${r.status}`, r.status);
          continue;
        }
        if (!r.ok) {
          // O corpo do erro do PostgREST descreve a falha (coluna, tabela), nunca o valor gravado.
          const detalhe = (await r.text().catch(() => "")).slice(0, 200);
          throw new ErroKv(`Supabase respondeu ${r.status}${detalhe ? `: ${detalhe}` : ""}`, r.status);
        }
        return r;
      } catch (e) {
        if (e instanceof ErroKv && e.status !== undefined && e.status < 500 && e.status !== 429) throw e;
        ultimo = e instanceof ErroKv ? e : new ErroKv(`falha de rede com o Supabase: ${e instanceof Error ? e.name : "erro"}`);
      }
    }
    throw ultimo instanceof ErroKv ? ultimo : new ErroKv("Supabase indisponível");
  }

  const eq = (v: string) => `eq.${encodeURIComponent(v)}`;
  const linha = (namespace: string, key: string, value: unknown) => ({ namespace, key, value, updated_at: new Date().toISOString() });

  return {
    nome: "supabase",
    async get<T>(namespace: string, key: string) {
      conferir(namespace, key);
      const r = await pedir(`?namespace=${eq(namespace)}&key=${eq(key)}&select=value&limit=1`, { headers: cabecalhos() });
      const linhas = (await r.json()) as { value: T }[];
      return linhas.length > 0 ? linhas[0].value : null;
    },
    async set(namespace, key, value) {
      conferir(namespace, key);
      await pedir("?on_conflict=namespace,key", {
        method: "POST",
        headers: cabecalhos({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify([linha(namespace, key, value)]),
      });
    },
    async setIfAbsent(namespace, key, value) {
      conferir(namespace, key);
      const r = await pedir("?on_conflict=namespace,key", {
        method: "POST",
        headers: cabecalhos({ Prefer: "resolution=ignore-duplicates,return=representation" }),
        body: JSON.stringify([linha(namespace, key, value)]),
      });
      return ((await r.json()) as unknown[]).length > 0;
    },
    async list<T>(namespace: string) {
      conferir(namespace, "-");
      const todos: RegistroKv<T>[] = [];
      for (let pagina = 0; ; pagina++) {
        const r = await pedir(
          `?namespace=${eq(namespace)}&select=key,value,updated_at&order=updated_at.asc,key.asc&limit=${PAGINA}&offset=${pagina * PAGINA}`,
          { headers: cabecalhos() },
        );
        const linhas = (await r.json()) as { key: string; value: T; updated_at: string }[];
        for (const l of linhas) todos.push({ key: l.key, value: l.value, updatedAt: Date.parse(l.updated_at) });
        if (linhas.length < PAGINA) return todos;
      }
    },
    async delete(namespace, key) {
      conferir(namespace, key);
      await pedir(`?namespace=${eq(namespace)}&key=${eq(key)}`, { method: "DELETE", headers: cabecalhos({ Prefer: "return=minimal" }) });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Seleção
// ---------------------------------------------------------------------------------------------

/** `ARMAZENAMENTO=memoria` ignora o Supabase (útil para desenvolver sem mexer nos dados reais). */
export function supabaseConfigurado(): { url: string; chave: string } | null {
  if (process.env.ARMAZENAMENTO === "memoria") return null;
  const url = process.env.SUPABASE_URL?.trim();
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && chave ? { url, chave } : null;
}

const CHAVE_GLOBAL = Symbol.for("convergechallenge.kvPadrao");

/** Supabase se configurado; senão memória (singleton em globalThis, sobrevive ao HMR). */
export function kvPadrao(): Kv {
  const g = globalThis as unknown as Record<symbol, Kv | undefined>;
  const cfg = supabaseConfigurado();
  const atual = g[CHAVE_GLOBAL];
  if (atual && (atual.nome === "supabase") === (cfg !== null)) return atual;
  return (g[CHAVE_GLOBAL] = cfg ? criarKvSupabase(cfg) : criarKvEmMemoria());
}

/** O Supabase quando configurado; senão null (quem tem reserva em arquivo continua usando o arquivo). */
export function kvRemoto(): Kv | null {
  const kv = kvPadrao();
  return kv.nome === "supabase" ? kv : null;
}

/** Só para testes: troca (ou limpa, com null) o singleton. */
export function definirKvParaTestes(kv: Kv | null): void {
  const g = globalThis as unknown as Record<symbol, Kv | undefined>;
  if (kv) g[CHAVE_GLOBAL] = kv;
  else delete g[CHAVE_GLOBAL];
}
