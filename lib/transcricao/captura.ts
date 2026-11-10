import { AUDIO_DO_MICROFONE } from "../presenca/microfone";
/** Captura somente áudio. Um stream recebido pertence ao chamador e nunca é encerrado aqui. */
export async function capturarAudio({ stream, signal, aoAudio }: {
  stream?: MediaStream | null;
  signal: AbortSignal;
  aoAudio: (base64: string) => void;
}) {
  const proprio = !stream;
  const midia = stream ?? await navigator.mediaDevices.getUserMedia({
    audio: { ...AUDIO_DO_MICROFONE, channelCount: 1 },
  });
  let contexto: AudioContext | undefined;
  let fonte: MediaStreamAudioSourceNode | undefined;
  let processador: AudioWorkletNode | undefined;
  let ganho: GainNode | undefined;
  let encerrada = false;
  let finalizar: (() => void) | undefined;

  function cancelar() {
    if (encerrada) return;
    encerrada = true;
    signal.removeEventListener("abort", cancelar);
    fonte?.disconnect();
    processador?.disconnect();
    if (processador) processador.port.onmessage = null;
    ganho?.disconnect();
    if (proprio) midia.getTracks().forEach((t) => t.stop());
    void contexto?.close().catch(() => {});
    finalizar?.();
  }

  try {
    signal.throwIfAborted();
    signal.addEventListener("abort", cancelar, { once: true });
    contexto = new AudioContext({ sampleRate: 16000 });
    if (contexto.sampleRate !== 16000) throw new Error("O navegador não conseguiu preparar o áudio para a transcrição.");
    await contexto.audioWorklet.addModule("/audio/transcricao-processor.js");
    signal.throwIfAborted();
    fonte = contexto.createMediaStreamSource(new MediaStream(midia.getAudioTracks()));
    processador = new AudioWorkletNode(contexto, "transcricao-pcm");
    processador.port.onmessage = ({ data }: MessageEvent<ArrayBuffer | string>) => {
      if (encerrada) return;
      if (data === "finalizado") { finalizar?.(); return; }
      if (data instanceof ArrayBuffer) {
        let binario = "";
        for (const b of new Uint8Array(data)) binario += String.fromCharCode(b);
        aoAudio(btoa(binario));
      }
    };
    // Mantém o grafo processando sem reproduzir o microfone nos alto-falantes.
    ganho = contexto.createGain();
    ganho.gain.value = 0;
    fonte.connect(processador).connect(ganho).connect(contexto.destination);
    await contexto.resume();
    signal.throwIfAborted();
    return {
      cancelar,
      async parar() {
        if (encerrada) return;
        fonte?.disconnect();
        let timer: ReturnType<typeof setTimeout> | undefined;
        await new Promise<void>((resolve) => {
          finalizar = resolve;
          timer = setTimeout(resolve, 500);
          processador?.port.postMessage("finalizar");
        });
        clearTimeout(timer);
        cancelar();
      },
    };
  } catch (erro) {
    cancelar();
    throw erro;
  }
}
