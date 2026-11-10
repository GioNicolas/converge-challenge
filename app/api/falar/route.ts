import { NextResponse } from "next/server";
import { RespostaVoz } from "@/lib/voz/contrato";
import { criarLimitador, ipDe, lerTexto } from "@/lib/agente/rotas/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voz do agente: ElevenLabs com tempos por caractere (a legenda e a mão do agente seguem a fala).
// Sem ELEVENLABS_API_KEY responde 501. Com servidor, a fala fica na legenda (nunca troca para a voz do navegador).
// A voz do Totti é uma só, em todo o site (quadro, live coding, pré-entrevista): Fernando - Casual (pt-BR), no
// eleven_flash_v2_5, com os ajustes abaixo. Escolhida ouvindo amostras em 2026-11-09. Fixa de propósito, sem variável
// de ambiente: com os ajustes do painel (estilo 0,15, velocidade 1) o tom mudava de uma fala para outra e soava lenta.
const VOZ = "jyRzzBWbHll8EUfOjmhe";
// ~0,4 s numa fala curta (o turbo_v2_5 dá o mesmo tempo; o multilingual_v2, 0,65-0,8 s).
const MODELO = "eleven_flash_v2_5";
/** Estabilidade alta e estilo 0: a voz soa igual em toda fala. Velocidade 1,1 tira a lentidão. */
const AJUSTES_DA_VOZ = { stability: 0.75, similarity_boost: 0.85, style: 0, use_speaker_boost: true, speed: 1.1 } as const;
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

  const voz = encodeURIComponent(VOZ);
  try {
    const resposta = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto, model_id: MODELO, language_code: "pt", voice_settings: AJUSTES_DA_VOZ }),
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
