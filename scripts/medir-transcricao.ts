// Roteiro de medição da transcrição (#75): compara a taxa de erro por palavra (WER) e os termos técnicos com e
// sem vocabulário (keyterms), no mesmo Scribe Realtime das salas. Pago e explícito: rode com --pago.
//
// Uso:
//   npx tsx --env-file-if-exists=.env.local scripts/medir-transcricao.ts --pago [pasta]
//
// A pasta (padrão: fixtures/transcricao) tem um áudio por frase gravada (qualquer formato que o ffmpeg lê) e, ao
// lado, um .txt com o mesmo nome: a 1ª linha é o que foi dito; uma linha "termos: a, b" lista os termos que
// precisam sair certos. Os termos do vocabulário usados são os de `termosDoLiveCoding` (two-sum, python) somados
// aos de recrutamento e aos esperados nas frases. Nenhuma chave ou token é impresso.
import { pago } from "./_gasto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { mensagemDeAudio, urlDoScribe } from "../lib/presenca/transcricao";
import { normalizarTermos, termosDoLiveCoding, TERMOS_RECRUTAMENTO } from "../lib/transcricao/vocabulario";
import { taxaDeErroPorPalavra, termosAcertados } from "../lib/transcricao/medicao";

if (!pago) {
  console.error("Este script gasta crédito do ElevenLabs (transcrição). Rode com --pago para confirmar.");
  process.exit(1);
}

type Frase = { nome: string; pcm: Buffer; referencia: string; termos: string[] };

function carregar(pasta: string): Frase[] {
  if (!existsSync(pasta)) throw new Error(`Pasta ${pasta} não existe. Grave as frases do roteiro e coloque lá.`);
  return readdirSync(pasta)
    .filter((arquivo) => extname(arquivo) !== ".txt" && existsSync(join(pasta, `${basename(arquivo, extname(arquivo))}.txt`)))
    .map((arquivo) => {
      const nome = basename(arquivo, extname(arquivo));
      const linhas = readFileSync(join(pasta, `${nome}.txt`), "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
      const termos = linhas.find((l) => l.startsWith("termos:"))?.slice(7).split(",").map((t) => t.trim()).filter(Boolean) ?? [];
      const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", join(pasta, arquivo), "-ar", "16000", "-ac", "1", "-f", "s16le", "pipe:1"], { maxBuffer: 50_000_000 });
      return { nome, pcm, referencia: linhas[0] ?? "", termos };
    });
}

async function token(): Promise<string> {
  const resposta = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
  });
  if (!resposta.ok) throw new Error(`Token do Scribe respondeu HTTP ${resposta.status}.`);
  return ((await resposta.json()) as { token: string }).token;
}

/** Manda o áudio em tempo real (blocos de 100 ms), mais 1,5 s de silêncio, e junta os trechos confirmados. */
async function transcrever(pcm: Buffer, termos: string[]): Promise<{ texto: string; ultimoMs: number }> {
  const ws = new WebSocket(urlDoScribe(await token(), termos));
  const trechos: string[] = [];
  let ultimoMs = 0;
  const inicio = performance.now();
  await new Promise<void>((resolve, reject) => {
    ws.onerror = () => reject(new Error("WebSocket do Scribe falhou."));
    ws.onmessage = (evento) => {
      const m = JSON.parse(String(evento.data)) as { message_type?: string; text?: string };
      if (m.message_type === "session_started") resolve();
      if (m.message_type === "committed_transcript" && m.text?.trim()) {
        trechos.push(m.text.trim());
        ultimoMs = performance.now() - inicio;
      }
    };
  });
  const amostras = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const completo = new Float32Array(amostras.length + 24_000);
  amostras.forEach((a, i) => { completo[i] = a / 32768; });
  for (let i = 0; i < completo.length; i += 1600) {
    ws.send(mensagemDeAudio(completo.subarray(i, i + 1600), i + 1600 >= completo.length));
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 3000));
  ws.close();
  return { texto: trechos.join(" "), ultimoMs };
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("Configure ELEVENLABS_API_KEY no ambiente.");
  const frases = carregar(process.argv[2] ?? "fixtures/transcricao");
  if (!frases.length) throw new Error("Nenhuma frase com .txt de referência na pasta.");
  const vocabulario = normalizarTermos(frases.flatMap((f) => f.termos), termosDoLiveCoding({ problemaId: "two-sum", linguagem: "python" }), TERMOS_RECRUTAMENTO);
  const total = { antes: 0, depois: 0, termosAntes: 0, termosDepois: 0, termos: 0 };
  for (const frase of frases) {
    const antes = await transcrever(frase.pcm, []);
    const depois = await transcrever(frase.pcm, vocabulario);
    const [werAntes, werDepois] = [taxaDeErroPorPalavra(frase.referencia, antes.texto), taxaDeErroPorPalavra(frase.referencia, depois.texto)];
    const [tAntes, tDepois] = [termosAcertados(frase.termos, antes.texto), termosAcertados(frase.termos, depois.texto)];
    total.antes += werAntes;
    total.depois += werDepois;
    total.termos += frase.termos.length;
    total.termosAntes += tAntes.filter((t) => t.acertou).length;
    total.termosDepois += tDepois.filter((t) => t.acertou).length;
    console.log(`\n${frase.nome}\n  dito:   ${frase.referencia}\n  antes:  ${antes.texto}  (WER ${(werAntes * 100).toFixed(0)}%)\n  depois: ${depois.texto}  (WER ${(werDepois * 100).toFixed(0)}%)`);
    const errados = tDepois.filter((t) => !t.acertou).map((t) => t.termo);
    if (errados.length) console.log(`  termos ainda errados: ${errados.join(", ")}`);
  }
  console.log(`\nWER médio: antes ${(total.antes / frases.length * 100).toFixed(1)}% → depois ${(total.depois / frases.length * 100).toFixed(1)}%`);
  console.log(`Termos certos: antes ${total.termosAntes}/${total.termos} → depois ${total.termosDepois}/${total.termos}`);
}

main().catch((erro) => { console.error(erro instanceof Error ? erro.message : erro); process.exit(1); });
