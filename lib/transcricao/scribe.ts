import { AudioFormat, CommitStrategy, RealtimeEvents, Scribe } from "@elevenlabs/client";
import { capturarAudio } from "./captura";
import type { EventosTranscricao, SessaoTranscricao } from "./tipos";

export async function iniciarScribe({ token, stream, signal, eventos }: {
  token: string;
  stream?: MediaStream | null;
  signal: AbortSignal;
  eventos: EventosTranscricao;
}, dependencias = { conectar: Scribe.connect, capturar: capturarAudio }): Promise<SessaoTranscricao> {
  signal.throwIfAborted();
  const conexao = dependencias.conectar({
    token,
    modelId: "scribe_v2_realtime",
    languageCode: "pt",
    audioFormat: AudioFormat.PCM_16000,
    sampleRate: 16000,
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 1,
    // Sem isso o Scribe transcreve hesitações ao pé da letra ("ca-- s--", "ééé", "hã"). Testado com o
    // scribe_v2_realtime: "Eu tô querendo ca-- ééé, contratar, hã..." vira "Eu tô querendo contratar...".
    noVerbatim: true,
  });
  let encerrada = false;
  let parando = false;
  let captura: Awaited<ReturnType<typeof capturarAudio>> | undefined;
  let confirmar: (() => void) | undefined;
  let rejeitarInicio: ((erro: Error) => void) | undefined;
  let parada: Promise<void> | undefined;
  let enviouAudio = false;
  let bytesEnviados = 0;
  const controladorCaptura = new AbortController();

  function encerrar() {
    if (encerrada) return;
    encerrada = true;
    signal.removeEventListener("abort", cancelar);
    controladorCaptura.abort();
    captura?.cancelar();
    conexao.close();
    confirmar?.();
    eventos.aoParcial("");
    eventos.aoEncerrar();
  }
  function cancelar() {
    rejeitarInicio?.(new DOMException("Transcrição cancelada", "AbortError"));
    encerrar();
  }
  function falhar(erro: Error) {
    if (encerrada) return;
    rejeitarInicio?.(erro);
    eventos.aoErro(erro);
    encerrar();
  }
  signal.addEventListener("abort", cancelar, { once: true });
  conexao.on(RealtimeEvents.PARTIAL_TRANSCRIPT, ({ text }) => {
    if (!encerrada) eventos.aoParcial(text);
  });
  conexao.on(RealtimeEvents.COMMITTED_TRANSCRIPT, ({ text }) => {
    if (encerrada) return;
    eventos.aoParcial("");
    if (text.trim()) eventos.aoTexto(text.trim());
    if (parando) confirmar?.();
  });
  conexao.on(RealtimeEvents.ERROR, (evento) => {
    if (parando && evento.message_type === "insufficient_audio_activity") {
      confirmar?.();
      return;
    }
    falhar(new Error("A transcrição de voz falhou. Confira a conexão e a configuração da ElevenLabs."));
  });
  conexao.on(RealtimeEvents.CLOSE, () => {
    if (!encerrada) falhar(new Error("A conexão da transcrição foi interrompida. Tente novamente."));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("A transcrição demorou para conectar. Tente novamente.")), 10000);
      rejeitarInicio = (erro) => { clearTimeout(timer); reject(erro); };
      conexao.on(RealtimeEvents.SESSION_STARTED, () => {
        clearTimeout(timer);
        rejeitarInicio = undefined;
        resolve();
      });
    });
    signal.throwIfAborted();
    captura = await dependencias.capturar({ stream, signal: controladorCaptura.signal, aoAudio: (audioBase64) => {
      if (encerrada) return;
      try {
        conexao.send({ audioBase64 });
        bytesEnviados += atob(audioBase64).length;
        enviouAudio = true;
      } catch { falhar(new Error("Não consegui enviar o áudio. Tente novamente.")); }
    } });
    signal.throwIfAborted();
    if (encerrada) { captura.cancelar(); throw new Error("A transcrição foi interrompida."); }
  } catch (erro) {
    encerrar();
    throw erro;
  }

  return {
    cancelar,
    parar() {
      if (parada) return parada;
      parada = (async () => {
        if (encerrada) return;
        await captura?.parar();
        if (encerrada) return;
        // Um commit por silêncio pode chegar depois que o próximo áudio já foi enviado.
        // Sempre drena o fim da captura, mesmo se um segmento acabou de ser confirmado.
        if (!enviouAudio) { encerrar(); return; }
        // O modelo começa a processar após ~2 s de áudio. Completa falas curtas
        // (como "sim") com silêncio para que o primeiro commit possa ser reconhecido.
        if (bytesEnviados < 64000) {
          try {
            conexao.send({ audioBase64: btoa("\0".repeat(64000 - bytesEnviados)) });
          } catch { falhar(new Error("Não consegui finalizar o áudio. Tente novamente.")); return; }
        }
        parando = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        await new Promise<void>((resolve) => {
          confirmar = resolve;
          timer = setTimeout(() => {
            eventos.aoErro(new Error("Não recebi o fim da transcrição. Confira o texto antes de enviar."));
            resolve();
          }, 4000);
          try { conexao.commit(); } catch { resolve(); }
        });
        clearTimeout(timer);
        encerrar();
      })();
      return parada;
    },
  };
}
