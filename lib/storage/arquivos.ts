// Armazenamento de arquivos binários (os desenhos do candidato). Só servidor.
// Com Supabase configurado usa o Storage (bucket privado `desenhos`); sem, memória (testes e dev).
import { supabaseConfigurado } from "./kv";

export interface ArmazenamentoDeArquivos {
  readonly nome: "supabase" | "memoria";
  salvar(caminho: string, bytes: Uint8Array, tipo: string): Promise<void>;
  obter(caminho: string): Promise<Uint8Array | null>;
}

export class ErroArquivos extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
    this.name = "ErroArquivos";
  }
}

export function criarArquivosEmMemoria(): ArmazenamentoDeArquivos {
  const mapa = new Map<string, Uint8Array>();
  return {
    nome: "memoria",
    async salvar(caminho, bytes) {
      mapa.set(caminho, bytes.slice());
    },
    async obter(caminho) {
      return mapa.get(caminho)?.slice() ?? null;
    },
  };
}

const BUCKET = "desenhos";
const PRAZO_MS = 20_000;
const CAMINHO_VALIDO = /^[A-Za-z0-9_\-./]{1,200}$/;

export function criarArquivosSupabase(opcoes: { url: string; chave: string }): ArmazenamentoDeArquivos {
  const base = `${opcoes.url.replace(/\/+$/, "")}/storage/v1/object`;
  const auth = { apikey: opcoes.chave, Authorization: `Bearer ${opcoes.chave}` };
  const conferir = (caminho: string) => {
    if (!CAMINHO_VALIDO.test(caminho) || caminho.includes("..")) throw new ErroArquivos("caminho de arquivo inválido");
  };
  return {
    nome: "supabase",
    async salvar(caminho, bytes, tipo) {
      conferir(caminho);
      const r = await fetch(`${base}/${BUCKET}/${caminho}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": tipo, "x-upsert": "true" },
        body: Buffer.from(bytes),
        cache: "no-store",
        signal: AbortSignal.timeout(PRAZO_MS),
      });
      if (!r.ok) throw new ErroArquivos(`Supabase Storage respondeu ${r.status}`, r.status);
    },
    async obter(caminho) {
      conferir(caminho);
      const r = await fetch(`${base}/authenticated/${BUCKET}/${caminho}`, {
        headers: auth,
        cache: "no-store",
        signal: AbortSignal.timeout(PRAZO_MS),
      });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new ErroArquivos(`Supabase Storage respondeu ${r.status}`, r.status);
      return new Uint8Array(await r.arrayBuffer());
    },
  };
}

const CHAVE_GLOBAL = Symbol.for("convergechallenge.arquivosPadrao");

export function arquivosPadrao(): ArmazenamentoDeArquivos {
  const g = globalThis as unknown as Record<symbol, ArmazenamentoDeArquivos | undefined>;
  const cfg = supabaseConfigurado();
  const atual = g[CHAVE_GLOBAL];
  if (atual && (atual.nome === "supabase") === (cfg !== null)) return atual;
  return (g[CHAVE_GLOBAL] = cfg ? criarArquivosSupabase(cfg) : criarArquivosEmMemoria());
}
