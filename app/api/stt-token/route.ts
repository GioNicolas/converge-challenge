import { NextRequest, NextResponse } from "next/server";
import { criarLimitador, ipDe } from "@/lib/agente/rotas/http";
import { getSession } from "@/lib/session/store";
import { contexto as contextoAgente } from "@/lib/agente/rotas/contexto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Token temporário (uso único) para o navegador abrir o WebSocket do Scribe em tempo real.
// A chave do ElevenLabs fica só aqui, no servidor.
const URL_TOKEN = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";

// Uma conexão usa 1 token + até 5 reconexões; os limites deixam folga e barram laços de pedidos.
// Os contadores ficam em memória, como o store de sessões (lib/session/store): uma sessão só existe na
// instância que a criou, então o limite por sessão vale onde a sessão vale. O teto global limita o gasto
// total com o ElevenLabs, mesmo que alguém crie muitas sessões novas (o evento session_started não exige login).
const limitadorPorIp = criarLimitador(30, 60_000);
const limitadorPorSessao = criarLimitador(20, 600_000);
const limitadorPorSessaoNaHora = criarLimitador(60, 3_600_000);
const limitadorGlobal = criarLimitador(300, 600_000);

const erro = (status: number, mensagem: string) => NextResponse.json({ erro: mensagem }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return erro(403, "Origem não permitida.");
  const contexto = req.nextUrl.searchParams.get("contexto") ?? "coding";
  if (contexto !== "coding" && contexto !== "quadro") return erro(400, "Contexto inválido.");
  const sessaoId = req.nextUrl.searchParams.get("sessao_id")?.trim() ?? "";
  if (!sessaoId || sessaoId.length > 80) return erro(400, "sessao_id obrigatório.");
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) return erro(503, "ELEVENLABS_API_KEY não configurada.");

  if (limitadorPorIp.estourou(ipDe(req))) return erro(429, "muitos pedidos de token; tente em instantes");
  // Só sai token para sessão real e em andamento.
  const sessao = contexto === "quadro"
    ? await contextoAgente().repositorio.obter(sessaoId)
    : getSession(sessaoId);
  if (!sessao) return erro(404, "sessão não encontrada");
  if (("ended" in sessao && sessao.ended) || ("estado" in sessao && sessao.estado.fase === "ENCERRADA")) return erro(409, "sessão encerrada");
  const chaveSessao = `${contexto}:${sessaoId}`;
  if (limitadorPorSessao.estourou(chaveSessao) || limitadorPorSessaoNaHora.estourou(chaveSessao)) {
    return erro(429, "muitos pedidos de token para esta sessão");
  }
  if (limitadorGlobal.estourou("global")) return erro(429, "limite de transcrição atingido; tente em instantes");

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
