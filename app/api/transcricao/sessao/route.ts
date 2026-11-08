import { NextResponse } from "next/server";
import { criarLimitador, ipDe } from "@/lib/agente/rotas/http";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };
const porIp = criarLimitador(30, 60_000);
const global = criarLimitador(300, 600_000);

/** A chave fica no servidor; o navegador recebe só um token de uso único. */
export async function POST(request: Request) {
  const origem = request.headers.get("origin");
  if (origem && origem !== new URL(request.url).origin) {
    return NextResponse.json({ erro: "Origem não permitida." }, { status: 403, headers });
  }
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) return NextResponse.json({ provedor: "navegador" }, { headers });
  if (porIp.estourou(ipDe(request)) || global.estourou("global")) {
    return NextResponse.json({ erro: "Limite de transcrição atingido. Tente em instantes." }, { status: 429, headers });
  }

  try {
    const resposta = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
      method: "POST",
      headers: { "xi-api-key": chave },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) {
      return NextResponse.json({ erro: "Não consegui autorizar a transcrição. Verifique a chave e os créditos da ElevenLabs." }, { status: 502, headers });
    }
    const dados: unknown = await resposta.json();
    if (typeof dados !== "object" || dados === null || !("token" in dados) || typeof dados.token !== "string" || !dados.token) {
      throw new Error("Token inválido");
    }
    return NextResponse.json({ provedor: "elevenlabs", token: dados.token }, { headers });
  } catch {
    return NextResponse.json({ erro: "O serviço de transcrição está indisponível. Tente novamente." }, { status: 502, headers });
  }
}
