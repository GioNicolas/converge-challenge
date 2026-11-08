import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voz do agente: ElevenLabs com tempos por caractere (a legenda e a mão do agente seguem a fala).
// Sem ELEVENLABS_API_KEY responde 501 e o quadro usa a voz do navegador.
// Voz do agente: Fernando - Casual (pt-BR, voz da biblioteca: a API exige plano pago).
// ELEVENLABS_VOICE_ID só é preciso para trocar de voz (copie o ID em Voices, no painel do ElevenLabs).
const VOZ_PADRAO = "jyRzzBWbHll8EUfOjmhe";
const MODELO_PADRAO = "eleven_multilingual_v2";
const MAXIMO_CARACTERES = 2000;

const erro = (status: number, mensagem: string) => NextResponse.json({ erro: mensagem }, { status });
const numeros = (valor: unknown): valor is number[] => Array.isArray(valor) && valor.every((n) => typeof n === "number" && Number.isFinite(n));

export async function POST(req: NextRequest) {
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave) return erro(501, "voz ainda não configurada");
  let texto = "";
  try {
    const corpo: unknown = await req.json();
    if (corpo && typeof corpo === "object" && typeof (corpo as { texto?: unknown }).texto === "string") texto = (corpo as { texto: string }).texto.trim();
  } catch {
    return erro(400, "JSON inválido.");
  }
  if (!texto || texto.length > MAXIMO_CARACTERES) return erro(400, `texto obrigatório (até ${MAXIMO_CARACTERES} caracteres).`);

  const voz = encodeURIComponent(process.env.ELEVENLABS_VOICE_ID?.trim() || VOZ_PADRAO);
  try {
    const resposta = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto, model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || MODELO_PADRAO, language_code: "pt" }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!resposta.ok) return erro(502, "ElevenLabs recusou o pedido de voz.");
    const dados = (await resposta.json()) as { audio_base64?: unknown; alignment?: Record<string, unknown> | null };
    const a = dados.alignment;
    if (typeof dados.audio_base64 !== "string" || !dados.audio_base64 || !a || !Array.isArray(a.characters)
      || !numeros(a.character_start_times_seconds) || !numeros(a.character_end_times_seconds)) {
      return erro(502, "Resposta inesperada do ElevenLabs.");
    }
    return NextResponse.json({
      audio_base64: dados.audio_base64,
      alinhamento: {
        characters: a.characters,
        character_start_times_seconds: a.character_start_times_seconds,
        character_end_times_seconds: a.character_end_times_seconds,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return erro(502, "ElevenLabs indisponível.");
  }
}
