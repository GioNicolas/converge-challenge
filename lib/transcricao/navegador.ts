import type { EventosTranscricao, SessaoTranscricao } from "./tipos";

// A Web Speech API ainda não faz parte de lib.dom em todos os TypeScripts.
type Resultado = { isFinal: boolean; [indice: number]: { transcript: string } };
type Reconhecimento = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((evento: { resultIndex: number; results: ArrayLike<Resultado> }) => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
export type ConstrutorReconhecimento = new () => Reconhecimento;

export function reconhecimentoDisponivel(): ConstrutorReconhecimento | undefined {
  const janela = window as unknown as {
    SpeechRecognition?: ConstrutorReconhecimento;
    webkitSpeechRecognition?: ConstrutorReconhecimento;
  };
  return janela.SpeechRecognition ?? janela.webkitSpeechRecognition;
}

export function iniciarNavegador(
  Construtor: ConstrutorReconhecimento,
  eventos: EventosTranscricao,
): SessaoTranscricao {
  const reconhecimento = new Construtor();
  reconhecimento.lang = "pt-BR";
  reconhecimento.continuous = true;
  reconhecimento.interimResults = true;
  let encerrada = false;
  let finalizar: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let parada: Promise<void> | undefined;
  const confirmados = new Set<number>();

  function encerrar() {
    if (encerrada) return;
    encerrada = true;
    clearTimeout(timer);
    reconhecimento.onresult = reconhecimento.onerror = reconhecimento.onend = null;
    eventos.aoParcial("");
    finalizar?.();
    eventos.aoEncerrar();
  }

  reconhecimento.onresult = ({ resultIndex, results }) => {
    if (encerrada) return;
    const parciais: string[] = [];
    for (let i = resultIndex; i < results.length; i++) {
      const resultado = results[i];
      const texto = resultado[0].transcript.trim();
      if (resultado.isFinal) {
        if (!confirmados.has(i)) {
          confirmados.add(i);
          if (texto) eventos.aoTexto(texto);
        }
      }
    }
    // O evento pode atualizar somente parte da lista; reconstrói todos os parciais.
    for (let i = 0; i < results.length; i++) {
      if (!results[i].isFinal) parciais.push(results[i][0].transcript);
    }
    eventos.aoParcial(parciais.join(" ").trim());
  };
  reconhecimento.onerror = ({ error }) => {
    if (encerrada) return;
    if (error !== "aborted" && error !== "no-speech") {
      const mensagens: Record<string, string> = {
        "not-allowed": "Permita o acesso ao microfone no navegador para ditar.",
        "service-not-allowed": "O navegador bloqueou o serviço de voz. Use outro navegador ou configure a transcrição no servidor.",
        "audio-capture": "Não consegui acessar o microfone.",
        network: "O serviço de voz do navegador está sem conexão. Tente novamente.",
        "language-not-supported": "O serviço de voz deste navegador não oferece português.",
      };
      eventos.aoErro(new Error(mensagens[error] ?? "A transcrição foi interrompida. Tente novamente."));
    }
    encerrar();
    reconhecimento.abort();
  };
  reconhecimento.onend = encerrar;
  try {
    reconhecimento.start();
  } catch (erro) {
    encerrar();
    throw erro;
  }

  return {
    parar() {
      if (encerrada) return Promise.resolve();
      if (parada) return parada;
      parada = new Promise<void>((resolve) => { finalizar = resolve; });
      timer = setTimeout(() => {
        eventos.aoErro(new Error("O serviço de voz não finalizou a fala. Confira o texto antes de enviar."));
        encerrar();
        reconhecimento.abort();
      }, 4000);
      try { reconhecimento.stop(); } catch { encerrar(); reconhecimento.abort(); }
      return parada;
    },
    cancelar() {
      encerrar();
      reconhecimento.abort();
    },
  };
}
