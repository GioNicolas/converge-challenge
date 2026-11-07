// Utilidades HTTP das rotas do cérebro: JSON de erro padronizado, leitura de corpo com limite,
// validação Zod (400 {erro, detalhes}) e limite de abuso por IP.
import type { ZodType, ZodTypeDef } from "zod";

export function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function erro(status: number, mensagem: string, detalhes?: unknown): Response {
  return json(detalhes === undefined ? { erro: mensagem } : { erro: mensagem, detalhes }, status);
}

export type Lido<T> = { ok: true; dados: T } | { ok: false; resposta: Response };

/** Lê o corpo como texto respeitando um limite de bytes (antes e depois de ler). */
export async function lerTexto(req: Request, maxBytes: number): Promise<Lido<string>> {
  const declarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    return { ok: false, resposta: erro(413, "corpo grande demais") };
  }
  let texto: string;
  try {
    texto = await req.text();
  } catch {
    return { ok: false, resposta: erro(400, "corpo ilegível") };
  }
  if (Buffer.byteLength(texto, "utf8") > maxBytes) {
    return { ok: false, resposta: erro(413, "corpo grande demais") };
  }
  return { ok: true, dados: texto };
}

/** Lê e valida um corpo JSON. Erros: 413 (grande), 400 (JSON inválido ou fora do esquema). */
export async function lerJsonValidado<T>(
  req: Request,
  esquema: ZodType<T, ZodTypeDef, unknown>,
  maxBytes: number,
): Promise<Lido<T>> {
  const texto = await lerTexto(req, maxBytes);
  if (!texto.ok) return texto;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.dados);
  } catch {
    return { ok: false, resposta: erro(400, "JSON inválido") };
  }
  const r = esquema.safeParse(bruto);
  if (!r.success) {
    // Só caminho e mensagem do Zod: nunca devolve o valor recebido.
    const detalhes = r.error.issues.slice(0, 10).map((i) => ({ caminho: i.path.join("."), mensagem: i.message }));
    return { ok: false, resposta: erro(400, "pedido inválido", detalhes) };
  }
  return { ok: true, dados: r.data };
}

export function ipDe(req: Request): string {
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "desconhecido"
  );
}

/**
 * Limite por IP em janela fixa, em memória. Best-effort (mesma ideia de lib/email/api.ts): é por
 * instância, zera a cada cold start e o IP vem de cabeçalhos que dependem do proxy.
 */
export function criarLimitador(max: number, janelaMs: number, agora: () => number = Date.now) {
  const acessos = new Map<string, { n: number; fim: number }>();
  return {
    /** true se este acesso passou do limite. */
    estourou(chave: string): boolean {
      const t = agora();
      if (acessos.size > 1000) for (const [k, v] of acessos) if (v.fim <= t) acessos.delete(k);
      const e = acessos.get(chave);
      if (!e || e.fim <= t) {
        acessos.set(chave, { n: 1, fim: t + janelaMs });
        return false;
      }
      e.n += 1;
      return e.n > max;
    },
    reiniciar() {
      acessos.clear();
    },
  };
}

/** Parâmetros de rota do Next 15 (`params` é uma Promise). */
export type ParamsId = { params: Promise<{ id: string }> };
