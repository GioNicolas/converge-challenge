import { NextResponse } from "next/server";
import { RespostaVoz } from "@/lib/voz/contrato";
import { criarLimitador, ipDe, lerTexto } from "@/lib/agente/rotas/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voz do agente: ElevenLabs com tempos por caractere (a legenda e a mão do agente seguem a fala).
// Sem ELEVENLABS_API_KEY responde 501 e o quadro usa a voz do navegador.
// Voz do agente: Fernando - Casual (pt-BR, voz da biblioteca: a API exige plano pago).
// ELEVENLABS_VOICE_ID só é preciso para trocar de voz (copie o ID em Voices, no painel do ElevenLabs).
const VOZ_PADRAO = "jyRzzBWbHll8EUfOjmhe";
// Turbo v2.5: a mesma demora do Flash (~0,4 s numa fala curta, medido em 2026-11-09) com voz de mais qualidade;
// o multilingual_v2 levava 0,65-0,8 s. Troque com ELEVENLABS_MODEL_ID.
const MODELO_PADRAO = "eleven_turbo_v2_5";
/**
 * Ajustes da voz. Sem eles valiam os da voz no painel (estilo 0,15, velocidade 1), e cada fala saía com um tom
 * diferente: o candidato sentia a voz "mudando". Estilo 0 e estabilidade alta deixam a voz igual de uma fala para
 * outra; 1,1 tira a lentidão. ELEVENLABS_VELOCIDADE e ELEVENLABS_ESTABILIDADE trocam sem deploy de código.
 */
function ajustesDaVoz() {
  const numero = (v: string | undefined, padrao: number, min: number, max: number) => {
    const n = Number(v);
    return v?.trim() && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  return {
    stability: numero(process.env.ELEVENLABS_ESTABILIDADE, 0.75, 0, 1),
    similarity_boost: 0.85,
    style: 0,
    use_speaker_boost: true,
    speed: numero(process.env.ELEVENLABS_VELOCIDADE, 1.1, 0.7, 1.2),
  };
}
const MAXIMO_CARACTERES = 2000;
const porIp = criarLimitador(60, 60_000);
const global = criarLimitador(300, 600_000);

const headers = { "Cache-Control": "no-store" };
const erro = (status: number, mensagem: string) => NextResponse.json({ erro: mensagem }, { status, headers });

export async function POST(req: Request) {
  const origem = req.headers.get("origin");
  if (origem && origem !== new URL(req.url).origin) return erro(403, "Origem não permitida.");
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) return erro(501, "voz ainda não configurada");
  let texto = "";
  try {
    const lido = await lerTexto(req, 16 * 1024);
    if (!lido.ok) return lido.resposta;
    const corpo: unknown = JSON.parse(lido.dados);
    if (corpo && typeof corpo === "object" && typeof (corpo as { texto?: unknown }).texto === "string") texto = (corpo as { texto: string }).texto.trim();
  } catch {
    return erro(400, "JSON inválido.");
  }
  if (!texto || texto.length > MAXIMO_CARACTERES) return erro(400, `texto obrigatório (até ${MAXIMO_CARACTERES} caracteres).`);
  if (porIp.estourou(ipDe(req)) || global.estourou("global")) return erro(429, "Limite de voz atingido. Tente em instantes.");

  const voz = encodeURIComponent(process.env.ELEVENLABS_VOICE_ID?.trim() || VOZ_PADRAO);
  try {
    const resposta = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto, model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || MODELO_PADRAO, language_code: "pt", voice_settings: ajustesDaVoz() }),
      cache: "no-store",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(20000)]),
    });
    if (!resposta.ok) return erro(502, "ElevenLabs recusou o pedido de voz.");
    const dados = (await resposta.json()) as { audio_base64?: unknown; alignment?: Record<string, unknown> | null };
    const vozGerada = RespostaVoz.safeParse({ audio_base64: dados.audio_base64, alinhamento: dados.alignment });
    if (!vozGerada.success) return erro(502, "Resposta inesperada do ElevenLabs.");
    return NextResponse.json(vozGerada.data, { headers });
  } catch {
    return erro(502, "ElevenLabs indisponível.");
  }
}
