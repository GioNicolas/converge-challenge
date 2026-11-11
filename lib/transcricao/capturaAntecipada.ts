import { capturarAudio } from "./captura";

type Captura = Awaited<ReturnType<typeof capturarAudio>>;
type Capturar = typeof capturarAudio;

/** Áudio guardado enquanto o token e o socket conectam: 20 s de PCM 16 kHz mono; acima disso sai o mais antigo. */
export const MAXIMO_BYTES_ANTECIPADOS = 640_000;

const bytesDe = (base64: string) => Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);

export type CapturaAntecipada = {
  /** Resolve quando o microfone está capturando; rejeita se ele não abriu (permissão, dispositivo). */
  readonly pronta: Promise<Captura>;
  /** Entrega o que foi guardado, em ordem, e passa a mandar o áudio novo direto para `destino`. */
  ligar(destino: (base64: string) => void): void;
  /** Fecha a captura esperando o último bloco do microfone. */
  parar(): Promise<void>;
  cancelar(): void;
};

/**
 * Começa a ouvir na hora do clique (ou da reabertura do microfone no modo voz), antes de existir token ou socket.
 * Sem isso, quem respondia logo depois do Totti perdia o primeiro segundo da frase ("Ele diz expresso.").
 */
export function iniciarCapturaAntecipada({ stream, capturar = capturarAudio, maximoBytes = MAXIMO_BYTES_ANTECIPADOS }: {
  /** Stream do chamador (nunca encerrado aqui) ou a promessa dele; sem stream, a captura abre o próprio. */
  stream?: MediaStream | null | Promise<MediaStream | null | undefined>;
  capturar?: Capturar;
  maximoBytes?: number;
}): CapturaAntecipada {
  const controlador = new AbortController();
  const guardados: string[] = [];
  let bytes = 0;
  let destino: ((base64: string) => void) | null = null;
  let captura: Captura | undefined;
  let cancelada = false;
  const pronta = Promise.resolve(stream).then((midia) => {
    if (cancelada) throw new DOMException("Captura cancelada", "AbortError");
    return midia;
  }).then((midia) => capturar({
    stream: midia,
    signal: controlador.signal,
    aoAudio: (base64) => {
      if (cancelada) return;
      if (destino) { destino(base64); return; }
      guardados.push(base64);
      bytes += bytesDe(base64);
      while (bytes > maximoBytes && guardados.length > 1) bytes -= bytesDe(guardados.shift()!);
    },
  })).then((c) => {
    captura = c;
    if (cancelada) c.cancelar();
    return c;
  });
  // Quem não chegar a esperar `pronta` (cancelou antes) não deve gerar rejeição sem tratamento.
  pronta.catch(() => {});
  return {
    pronta,
    ligar(novo) {
      if (cancelada) return;
      destino = novo;
      for (const base64 of guardados.splice(0)) novo(base64);
      bytes = 0;
    },
    parar() {
      if (cancelada) return Promise.resolve();
      // Sem `async`: com a captura já aberta, parar leva o mesmo número de passos que parar a captura direto.
      return captura ? captura.parar() : pronta.then((c) => c.parar(), () => {});
    },
    cancelar() {
      if (cancelada) return;
      cancelada = true;
      guardados.length = 0;
      destino = null;
      controlador.abort();
      captura?.cancelar();
    },
  };
}
