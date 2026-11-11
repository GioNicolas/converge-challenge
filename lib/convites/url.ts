type AmbienteUrl = { APP_URL?: string; NODE_ENV?: string; VERCEL_ENV?: string };

// Preview da Vercel também roda com NODE_ENV=production: lá a origem do deploy é aceitável.
function ehProducao(env: AmbienteUrl): boolean {
  return env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
}

export function resolverUrlPublica(env: AmbienteUrl, origem: string): string {
  const configurada = env.APP_URL?.trim();
  let url: URL;
  if (configurada) {
    try {
      url = new URL(configurada);
    } catch {
      url = new URL(origem);
    }
    const ehHttpLocal = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !(!ehProducao(env) && ehHttpLocal)) {
      console.warn(`[convites] APP_URL ignorada (precisa ser https): ${configurada}`);
      url = new URL(origem);
    }
  } else {
    url = new URL(origem);
  }

  const host = url.hostname.toLowerCase();
  if (ehProducao(env) && (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".vercel.app"))) {
    throw new Error(`URL pública inválida em produção: ${host}`);
  }
  return url.origin.replace(/\/$/, "");
}

export function urlPublica(req: Request): string {
  return resolverUrlPublica(process.env, new URL(req.url).origin);
}

type FetchHead = (input: string | URL, init?: RequestInit) => Promise<Response>;
const CACHE_MS = 5 * 60 * 1000;
const TEMPO_LIMITE_MS = 3_000;
const cacheDisponibilidade = new Map<string, { vivo: boolean; expira: number }>();

export async function verificarUrlPublica(
  base: string,
  origem: string,
  fetchHead: FetchHead = fetch,
): Promise<{ vivo: boolean; host: string }> {
  const url = new URL(base);
  const host = url.host;
  if (url.origin === new URL(origem).origin) return { vivo: true, host };

  const agora = Date.now();
  const salvo = cacheDisponibilidade.get(host);
  if (salvo && salvo.expira > agora) return { vivo: salvo.vivo, host };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEMPO_LIMITE_MS);
  let vivo = false;
  try {
    const resposta = await fetchHead(new URL("/agendar", url), { method: "HEAD", redirect: "manual", signal: controller.signal });
    vivo = resposta.status < 500;
  } catch {
    vivo = false;
  } finally {
    clearTimeout(timer);
  }
  cacheDisponibilidade.set(host, { vivo, expira: Date.now() + CACHE_MS });
  return { vivo, host };
}

export function limparCacheUrlPublica(): void {
  cacheDisponibilidade.clear();
}
