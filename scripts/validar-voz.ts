// Smoke test pago e explícito: texto sintético → TTS real → Scribe Realtime real.
// A chave vem apenas do ambiente. Nenhum token ou credencial é impresso.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { NextRequest } from "next/server";
import { Scribe, RealtimeEvents } from "@elevenlabs/client";
import { POST as sintetizar } from "../app/api/falar/route";
import { POST as autorizar } from "../app/api/transcricao/sessao/route";
import { iniciarScribe } from "../lib/transcricao/scribe";

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("Configure ELEVENLABS_API_KEY no ambiente.");
  const texto = "Olá. Vamos conversar sobre a solução em português.";
  const arquivo = process.argv.indexOf("--audio");
  let audio: Buffer;
  if (arquivo >= 0) audio = readFileSync(process.argv[arquivo + 1]);
  else {
    const resposta = await sintetizar(new NextRequest("http://localhost/api/falar", {
      method: "POST", body: JSON.stringify({ texto }),
    }));
    if (!resposta.ok) throw new Error(`TTS respondeu HTTP ${resposta.status}.`);
    const dados = await resposta.json();
    audio = Buffer.from(dados.audio_base64, "base64");
  }
  const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", "pipe:0", "-ar", "16000", "-ac", "1", "-f", "s16le", "pipe:1"], { input: audio, maxBuffer: 10_000_000 });
  const resposta = await autorizar(new Request("http://localhost/api/transcricao/sessao", { method: "POST" }));
  const dados = await resposta.json();
  if (!resposta.ok || dados.provedor !== "elevenlabs") throw new Error(`Autorização STT respondeu HTTP ${resposta.status}.`);
  const entrada = Buffer.concat([pcm, Buffer.alloc(64000)]);
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 30000);
  const textos: string[] = [];
  let falha = false;
  let concluiu: (() => void) | undefined;
  const enviado = new Promise<void>((resolve) => { concluiu = resolve; });
  let timer: ReturnType<typeof setInterval> | undefined;
  const inicio = Date.now();
  let sessao: Awaited<ReturnType<typeof iniciarScribe>> | undefined;
  try {
    sessao = await iniciarScribe({
      token: dados.token,
      signal: controle.signal,
      eventos: {
        aoTexto: (t) => textos.push(t), aoParcial: () => {},
        aoErro: () => { falha = true; concluiu?.(); }, aoEncerrar: () => concluiu?.(),
      },
    }, {
      conectar: (opcoes) => {
        const conexao = Scribe.connect(opcoes);
        conexao.on(RealtimeEvents.ERROR, (e) => process.stdout.write(JSON.stringify({ etapa: "erro-stt", codigo: e.message_type }) + "\n"));
        return conexao;
      },
      capturar: async ({ aoAudio, signal }) => {
        let posicao = 0;
        const parar = () => { clearInterval(timer); concluiu?.(); };
        signal.addEventListener("abort", parar, { once: true });
        timer = setInterval(() => {
          if (signal.aborted || posicao >= entrada.length) { parar(); return; }
          const fim = Math.min(posicao + 3200, entrada.length);
          aoAudio(entrada.subarray(posicao, fim).toString("base64"));
          posicao = fim;
        }, 100);
        return { cancelar: parar, parar: async () => { parar(); } };
      },
    });
    await enviado;
    await sessao.parar();
    const transcricao = textos.join(" ");
    const normalizado = transcricao.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (falha || !normalizado.includes("solucao") || !normalizado.includes("portugues")) {
      process.stdout.write(JSON.stringify({ etapa: "resultado-stt", transcricao, falha }) + "\n");
    }
    if (falha || !normalizado.includes("solucao") || !normalizado.includes("portugues")) throw new Error("O teste não confirmou a transcrição completa.");
    process.stdout.write(JSON.stringify({ ok: true, textoEsperado: texto, transcricao, duracaoMs: Date.now() - inicio }) + "\n");
  } finally {
    clearTimeout(prazo);
    clearInterval(timer);
    sessao?.cancelar();
    controle.abort();
  }
}

main().catch((erro: unknown) => {
  // Não imprimir stacks do SDK, URLs autenticadas ou respostas brutas do provedor.
  const mensagem = erro instanceof Error && /^(Configure |TTS respondeu|Autorização STT|O teste não confirmou)/u.test(erro.message)
    ? erro.message : "Falha na validação de voz. Confira conectividade, configuração e FFmpeg.";
  process.stderr.write(JSON.stringify({ ok: false, erro: mensagem }) + "\n");
  process.exitCode = 1;
});
