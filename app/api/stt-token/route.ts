import { NextRequest, NextResponse } from "next/server";

// Token temporário (uso único) para o navegador abrir o WebSocket do Scribe em tempo real.
// A chave do ElevenLabs fica só aqui, no servidor.
const URL_TOKEN = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";

export async function GET(req: NextRequest) {
  const sessaoId = req.nextUrl.searchParams.get("sessao_id")?.trim() ?? "";
  if (!sessaoId || sessaoId.length > 128) {
    return NextResponse.json({ erro: "sessao_id obrigatório." }, { status: 400 });
  }
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) {
    return NextResponse.json({ erro: "ELEVENLABS_API_KEY não configurada." }, { status: 503 });
  }
  try {
    const resposta = await fetch(URL_TOKEN, {
      method: "POST",
      headers: { "xi-api-key": chave },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) return NextResponse.json({ erro: "ElevenLabs recusou o pedido de token." }, { status: 502 });
    const dados: unknown = await resposta.json();
    const token = dados && typeof dados === "object" ? (dados as { token?: unknown }).token : undefined;
    if (typeof token !== "string" || !token) {
      return NextResponse.json({ erro: "Resposta inesperada do ElevenLabs." }, { status: 502 });
    }
    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ erro: "ElevenLabs indisponível." }, { status: 502 });
  }
}
