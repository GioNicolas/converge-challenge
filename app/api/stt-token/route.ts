import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Token temporário (uso único) para o navegador abrir o WebSocket do Scribe em tempo real.
// A chave do ElevenLabs fica só aqui, no servidor.
const URL_TOKEN = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";

/** Limite em memória (best-effort, por instância): cada token abre uma conexão cobrada no ElevenLabs. */
function criarLimitador(max: number, janelaMs: number) {
  const acessos = new Map<string, { contagem: number; expira: number }>();
  return {
    estourou(chave: string): boolean {
      const agora = Date.now();
      if (acessos.size > 1000) for (const [k, v] of acessos) if (v.expira <= agora) acessos.delete(k);
      const atual = acessos.get(chave);
      if (!atual || atual.expira <= agora) {
        acessos.set(chave, { contagem: 1, expira: agora + janelaMs });
        return false;
      }
      atual.contagem += 1;
      return atual.contagem > max;
    },
  };
}
// Uma conexão usa 1 token + até 5 reconexões; os limites deixam folga e barram laços de pedidos.
const limitadorPorIp = criarLimitador(30, 60_000);
const limitadorPorSessao = criarLimitador(20, 600_000);

const erro = (status: number, mensagem: string) => NextResponse.json({ erro: mensagem }, { status });

export async function GET(req: NextRequest) {
  const sessaoId = req.nextUrl.searchParams.get("sessao_id")?.trim() ?? "";
  if (!sessaoId || sessaoId.length > 80) return erro(400, "sessao_id obrigatório.");
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) return erro(503, "ELEVENLABS_API_KEY não configurada.");

  // x-real-ip é posto pelo proxy; x-forwarded-for pode ser forjado pelo cliente.
  const ip = req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limitadorPorIp.estourou(ip)) return erro(429, "muitos pedidos de token; tente em instantes");
  // Só sai token para sessão real e em andamento.
  const sessao = getSession(sessaoId);
  if (!sessao) return erro(404, "sessão não encontrada");
  if (sessao.ended) return erro(409, "sessão encerrada");
  if (limitadorPorSessao.estourou(sessaoId)) return erro(429, "muitos pedidos de token para esta sessão");

  try {
    const resposta = await fetch(URL_TOKEN, {
      method: "POST",
      headers: { "xi-api-key": chave },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) return erro(502, "ElevenLabs recusou o pedido de token.");
    const dados: unknown = await resposta.json();
    const token = dados && typeof dados === "object" ? (dados as { token?: unknown }).token : undefined;
    if (typeof token !== "string" || !token) return erro(502, "Resposta inesperada do ElevenLabs.");
    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return erro(502, "ElevenLabs indisponível.");
  }
}
