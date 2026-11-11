"use client";

import { useEffect, useRef, useState } from "react";
import { ErroTokenTranscricao, tokenTranscricao } from "./tokenTranscricao";
import {
  atualizarTranscricao, criarPortaoDeVoz, esperaParaReconectar, estadoInicialTranscricao, mensagemDeAudio,
  energiaRms, LIMIAR_VOZ_RMS, misturarMono, reamostrar, urlDoScribe, VOZ_MINIMA_MS,
  type EstadoReamostragem, type TrechoTranscrito,
} from "./transcricao";

export type { TrechoTranscrito } from "./transcricao";

/** Tempo de pausa (sem poder ouvir) com o socket aberto antes de fechá-lo. */
const PAUSA_MAXIMA_MS = 30_000;
/**
 * O Scribe fecha a conexão depois de ~15 s sem áudio. Reabrir pede token novo (limite de 20 por sessão a cada
 * 10 min), então, sem nada a enviar, vai um bloco curto de silêncio a cada MANTER_VIVO_MS: ~2% do tempo ocioso.
 */
const MANTER_VIVO_MS = 5_000;
const AMOSTRAS_MANTER_VIVO = 1600;
/** Áudio guardado enquanto o socket conecta (20 s a 16 kHz); acima disso descarta o mais antigo. */
const MAXIMO_PENDENTE = 320_000;
/** Acima disso no buffer do socket, a rede não está escoando: reconecta. */
const SOCKET_SATURADO = 262_144;
/**
 * Uma rajada (o que esperava a conexão) para de enviar acima disso e segue no próximo bloco ou tique: o
 * bufferedAmount só baixa entre tarefas, então mandar tudo de uma vez passaria de SOCKET_SATURADO sozinho.
 */
const LIMITE_RAJADA = 65_536;

export type EstadoEscuta = { motor: "elevenlabs" | "navegador" | "nenhum"; escutando: boolean; erro: string | null };
/** Uso do Scribe por sessão de escuta: o que é cobrado (áudio enviado) contra o tempo de sessão. */
export type UsoTranscricao = { audioEnviadoS: number; sessaoS: number };

// Tipos locais: a Web Speech API ainda não integra todas as versões de lib.dom.
type ResultadoNativo = { isFinal: boolean; 0: { transcript: string } };
type EventoResultado = { resultIndex: number; results: { length: number; [indice: number]: ResultadoNativo } };
type Reconhecimento = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
  onresult: ((evento: EventoResultado) => void) | null;
  start(trilha?: MediaStreamTrack): void; abort(): void;
};
type JanelaDeVoz = Window & {
  AudioContext?: typeof AudioContext;
  SpeechRecognition?: new () => Reconhecimento;
  webkitSpeechRecognition?: new () => Reconhecimento;
  webkitAudioContext?: typeof AudioContext;
};

/** Controlador separado do React para testar pausa, reconexão e liberação de recursos. */
export function criarEscutaTranscricao(opcoes: {
  stream: MediaStream;
  sessaoId: string | null;
  servidor: boolean;
  aoEstado: (estado: EstadoEscuta) => void;
  aoTrecho?: (trecho: TrechoTranscrito) => void;
  obterToken?: (sessaoId: string) => Promise<string>;
}): { ativar(ativo: boolean): void; parar(): void; uso(): UsoTranscricao } {
  const trilha = opcoes.stream.getAudioTracks()[0];
  const janela = typeof window === "undefined" ? undefined : window as JanelaDeVoz;
  let inicio: number | null = null;
  let estado: EstadoEscuta = { motor: "nenhum", escutando: false, erro: null };
  let texto = estadoInicialTranscricao();
  let ativo = false;
  let ouvindoAntes = false;
  let pausadoDesde: number | null = null;
  let encerrado = false;
  let geracao = 0;
  let tentativas = 0;
  let conectadoEm = 0;
  let conectando = false;
  let pronto = false;
  let segmento = 0;
  /** Quanto de voz (ms) o microfone captou desde o último trecho fechado. */
  let vozNoTrecho = 0;
  let socket: WebSocket | null = null;
  let contexto: AudioContext | null = null;
  let fonte: MediaStreamAudioSourceNode | null = null;
  let processador: ScriptProcessorNode | null = null;
  let ganho: GainNode | null = null;
  let reamostragem: EstadoReamostragem = { soma: 0, peso: 0 };
  let pendentes = new Float32Array(0);
  const portao = criarPortaoDeVoz();
  let ultimoEnvio = 0;
  let amostrasEnviadas = 0;
  let fimDaSessao: number | null = null;
  let repetir: ReturnType<typeof setTimeout> | null = null;
  let prazo: ReturnType<typeof setTimeout> | null = null;
  let reconhecimento: Reconhecimento | null = null;
  let reconhecendo = false;
  let iniciando = false;
  let rodada = 0;
  let falhasNavegador = 0;
  let navegadorBloqueado = false;
  let aceitaTrilha = true;

  const podeOuvir = () => ativo && (typeof document === "undefined" || !document.hidden)
    && !!trilha && trilha.readyState === "live" && trilha.enabled && !trilha.muted;
  const agora = () => inicio === null ? 0 : Math.max(0, performance.now() - inicio);
  function publicar(novo: EstadoEscuta) {
    if (encerrado) return;
    if (novo.motor === estado.motor && novo.escutando === estado.escutando && novo.erro === estado.erro) return;
    estado = novo;
    opcoes.aoEstado({ ...estado });
  }
  function limparParcial() {
    if (texto.parcial && !encerrado) opcoes.aoTrecho?.({ texto: "", final: false, inicio: agora() });
    texto = { ...texto, parcial: null };
    vozNoTrecho = 0;
    reamostragem = { soma: 0, peso: 0 };
    pendentes = new Float32Array(0);
    portao.reiniciar();
  }
  function receber(valor: string, final: boolean, chave: string) {
    if (encerrado || !podeOuvir()) return;
    const resultado = atualizarTranscricao(texto, { texto: valor, final, inicio: agora() }, chave);
    texto = resultado.estado;
    if (resultado.trecho) opcoes.aoTrecho?.(resultado.trecho);
  }
  function cancelarRepeticao() {
    if (repetir !== null) clearTimeout(repetir);
    repetir = null;
  }
  function limparSocket() {
    geracao++;
    conectando = pronto = false;
    if (prazo !== null) clearTimeout(prazo);
    prazo = null;
    const anterior = socket;
    socket = null;
    if (anterior) {
      anterior.onopen = anterior.onmessage = anterior.onclose = anterior.onerror = null;
      try { anterior.close(); } catch {}
    }
    limparParcial();
  }
  function limparAudio() {
    if (processador) processador.onaudioprocess = null;
    fonte?.disconnect();
    processador?.disconnect();
    ganho?.disconnect();
    if (contexto) void contexto.close().catch(() => {});
    contexto = fonte = processador = ganho = null;
  }
  function falharScribe(definitivo = false) {
    if (encerrado || estado.motor !== "elevenlabs") return;
    if (pronto && performance.now() - conectadoEm >= 10000) tentativas = 0;
    limparSocket();
    const espera = definitivo ? null : esperaParaReconectar(tentativas++);
    if (espera === null) {
      limparAudio();
      usarNavegador("Scribe indisponível; tentando transcrição do navegador.");
      return;
    }
    publicar({ motor: "elevenlabs", escutando: false, erro: `reconectando microfone (${tentativas}/5)` });
    if (podeOuvir()) repetir = setTimeout(() => { repetir = null; void conectarScribe(); }, espera);
  }
  function enviarAudio(amostras: Float32Array, commit = false) {
    if (!socket || !pronto || socket.readyState !== 1) return;
    if (socket.bufferedAmount > SOCKET_SATURADO) { falharScribe(); return; }
    try { socket.send(mensagemDeAudio(amostras, commit)); } catch { falharScribe(); return; }
    ultimoEnvio = performance.now();
    amostrasEnviadas += amostras.length;
  }
  /** Envia o que o portão deixou passar em blocos de 200 ms; `tudo` manda também o resto menor que um bloco. */
  function escoar(tudo: boolean) {
    if (!pronto || !socket || !pendentes.length) return;
    if (socket.bufferedAmount > SOCKET_SATURADO) { falharScribe(); return; }
    const livre = () => pronto && !!socket && socket.bufferedAmount <= LIMITE_RAJADA;
    let consumido = 0;
    while (livre() && pendentes.length - consumido >= 3200) {
      enviarAudio(pendentes.subarray(consumido, consumido + 3200));
      consumido += 3200;
    }
    if (livre() && tudo && pendentes.length > consumido) {
      enviarAudio(pendentes.subarray(consumido));
      consumido = pendentes.length;
    }
    if (!pronto) return;
    pendentes = pendentes.slice(consumido);
  }
  function guardar(amostras: Float32Array) {
    if (!amostras.length) return;
    const junto = new Float32Array(pendentes.length + amostras.length);
    junto.set(pendentes);
    junto.set(amostras, pendentes.length);
    pendentes = junto.length > MAXIMO_PENDENTE ? junto.slice(junto.length - MAXIMO_PENDENTE) : junto;
  }
  /** Parou de poder ouvir no meio de uma fala: completa a folga com silêncio para o Scribe fechar o trecho. */
  function fecharTrechoAberto() {
    if (!portao.aberto) return;
    guardar(portao.encerrar());
    escoar(true);
  }
  async function prepararAudio() {
    if (!contexto) {
      const Construtor = janela?.AudioContext ?? janela?.webkitAudioContext;
      if (!Construtor) throw new Error("Web Audio indisponível.");
      contexto = new Construtor();
      fonte = contexto.createMediaStreamSource(opcoes.stream);
      processador = contexto.createScriptProcessor(4096, 1, 1);
      ganho = contexto.createGain();
      ganho.gain.value = 0;
      processador.onaudioprocess = (evento) => {
        evento.outputBuffer.getChannelData(0).fill(0);
        // Enquanto conecta (token e handshake) o áudio também passa pelo portão e espera em `pendentes`.
        if (encerrado || !contexto || (!socket && !conectando)) return;
        // Sem poder ouvir (Totti falando, mudo, aba escondida) nada vai ao Scribe: o tempo enviado é cobrado.
        if (!podeOuvir()) {
          fecharTrechoAberto();
          return;
        }
        const canais = Array.from({ length: evento.inputBuffer.numberOfChannels }, (_, i) => evento.inputBuffer.getChannelData(i));
        const amostras = misturarMono(canais);
        const voz = energiaRms(amostras) >= LIMIAR_VOZ_RMS;
        if (voz) vozNoTrecho += (amostras.length / contexto.sampleRate) * 1000;
        const convertido = reamostrar(amostras, contexto.sampleRate, 16000, reamostragem);
        reamostragem = convertido.estado;
        const passou = portao.passar(convertido.amostras, voz);
        guardar(passou.amostras);
        // Enquanto o socket conecta, o áudio espera em `pendentes` e sai todo no session_started.
        escoar(passou.fechou);
      };
      fonte.connect(processador);
      processador.connect(ganho);
      ganho.connect(contexto.destination);
    }
    if (contexto.state === "suspended") await contexto.resume();
  }
  async function conectarScribe() {
    if (encerrado || conectando || socket || !podeOuvir() || !opcoes.sessaoId) return;
    conectando = true;
    const atual = ++geracao;
    prazo = setTimeout(() => { if (atual === geracao) falharScribe(); }, 10000);
    try {
      try { await prepararAudio(); } catch {
        if (!encerrado && atual === geracao) falharScribe(true);
        return;
      }
      if (encerrado || atual !== geracao) return;
      let token: string;
      try {
        token = await (opcoes.obterToken ?? tokenTranscricao)(opcoes.sessaoId);
      } catch (erro) {
        // Sem chave, sessão inexistente ou encerrada: repetir não resolve, vai direto ao navegador.
        if (!encerrado && atual === geracao) falharScribe(erro instanceof ErroTokenTranscricao && erro.permanente);
        return;
      }
      if (encerrado || atual !== geracao) return;
      const ws = new WebSocket(urlDoScribe(token));
      socket = ws;
      ws.onmessage = (evento) => {
        if (encerrado || atual !== geracao) return;
        let mensagem: unknown;
        try { mensagem = JSON.parse(String(evento.data)); } catch { falharScribe(); return; }
        if (!mensagem || typeof mensagem !== "object") return;
        const m = mensagem as { message_type?: string; text?: unknown; error?: unknown };
        if (m.message_type === "session_started") {
          if (prazo !== null) clearTimeout(prazo);
          prazo = null;
          pronto = true;
          conectando = false;
          conectadoEm = ultimoEnvio = performance.now();
          publicar({ motor: "elevenlabs", escutando: podeOuvir(), erro: null });
          escoar(!portao.aberto);
        } else if (m.message_type === "partial_transcript" && typeof m.text === "string") {
          // Sem voz no microfone, o parcial é alucinação: não mostra nem segura o turno do agente.
          if (vozNoTrecho >= VOZ_MINIMA_MS) receber(m.text, false, `${atual}:${segmento}`);
        } else if (m.message_type === "committed_transcript" && typeof m.text === "string") {
          if (vozNoTrecho >= VOZ_MINIMA_MS) receber(m.text, true, `${atual}:${segmento}`);
          else if (m.text.trim()) {
            console.debug("[transcrição] descartada (sem voz no microfone):", m.text);
            if (texto.parcial) opcoes.aoTrecho?.({ texto: "", final: false, inicio: agora() });
            texto = { ...texto, parcial: null };
          }
          segmento++;
          vozNoTrecho = 0;
        } else if (typeof m.error === "string") {
          falharScribe(["quota_exceeded", "unaccepted_terms", "input_error", "invalid_request", "chunk_size_exceeded"].includes(m.message_type ?? ""));
        }
      };
      ws.onerror = ws.onclose = () => { if (atual === geracao) falharScribe(); };
    } catch {
      if (!encerrado && atual === geracao) falharScribe();
    }
  }
  function agendarNavegador(erro = false) {
    if (encerrado || !podeOuvir() || navegadorBloqueado || repetir !== null) return;
    const espera = erro ? esperaParaReconectar(falhasNavegador++) : 250;
    if (espera === null) {
      navegadorBloqueado = true;
      publicar({ motor: "nenhum", escutando: false, erro: "Não foi possível reiniciar a transcrição do navegador." });
      return;
    }
    if (erro) publicar({ motor: "navegador", escutando: false, erro: "reconectando microfone" });
    repetir = setTimeout(() => { repetir = null; iniciarNavegador(); }, espera);
  }
  function iniciarNavegador() {
    if (encerrado || !podeOuvir() || !reconhecimento || reconhecendo || iniciando || navegadorBloqueado) return;
    iniciando = true;
    rodada++;
    try {
      if (aceitaTrilha) reconhecimento.start(trilha);
      else reconhecimento.start();
    } catch (erro) {
      iniciando = false;
      if (aceitaTrilha && erro instanceof TypeError) {
        aceitaTrilha = false;
        iniciarNavegador();
        return;
      }
      agendarNavegador(true);
    }
  }
  function usarNavegador(motivo: string | null = null) {
    cancelarRepeticao();
    const Construtor = janela?.SpeechRecognition ?? janela?.webkitSpeechRecognition;
    if (!Construtor) {
      publicar({ motor: "nenhum", escutando: false, erro: "Transcrição de voz indisponível neste navegador." });
      return;
    }
    try { reconhecimento = new Construtor(); } catch {
      publicar({ motor: "nenhum", escutando: false, erro: "Não foi possível iniciar a transcrição do navegador." });
      return;
    }
    reconhecimento.lang = "pt-BR";
    reconhecimento.continuous = reconhecimento.interimResults = true;
    reconhecimento.onstart = () => {
      iniciando = false;
      reconhecendo = true;
      if (!podeOuvir()) { reconhecendo = false; reconhecimento?.abort(); return; }
      publicar({ motor: "navegador", escutando: true, erro: null });
    };
    reconhecimento.onresult = (evento) => {
      if (encerrado || !podeOuvir()) return;
      const parciais: string[] = [];
      for (let i = 0; i < evento.results.length; i++) {
        const resultado = evento.results[i];
        if (resultado.isFinal && i >= evento.resultIndex) {
          receber(resultado[0].transcript, true, `n:${rodada}:${i}`);
          falhasNavegador = 0;
        } else if (!resultado.isFinal) parciais.push(resultado[0].transcript);
      }
      if (parciais.length) receber(parciais.join(" "), false, `n:${rodada}:${evento.results.length - parciais.length}`);
      else if (texto.parcial) limparParcial();
    };
    reconhecimento.onend = () => {
      iniciando = reconhecendo = false;
      limparParcial();
      publicar({ ...estado, escutando: false });
      agendarNavegador();
    };
    reconhecimento.onerror = (evento) => {
      if (encerrado || !podeOuvir()) return;
      if (["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(evento.error)) {
        navegadorBloqueado = true;
        publicar({ motor: "nenhum", escutando: false, erro: `Microfone indisponível para transcrição (${evento.error}).` });
      } else agendarNavegador(!["aborted", "no-speech"].includes(evento.error));
      iniciando = reconhecendo = false;
      try { reconhecimento?.abort(); } catch {}
    };
    publicar({ motor: "navegador", escutando: false, erro: motivo });
    if (podeOuvir()) iniciarNavegador();
  }
  function sincronizarAtividade() {
    if (encerrado) return;
    const ouvir = podeOuvir();
    if (!ouvir && ouvindoAntes) {
      fecharTrechoAberto();
      limparParcial();
      cancelarRepeticao();
      if (reconhecimento && (reconhecendo || iniciando)) {
        iniciando = reconhecendo = false;
        try { reconhecimento.abort(); } catch {}
      }
    }
    ouvindoAntes = ouvir;
    pausadoDesde = ouvir ? null : (pausadoDesde ?? performance.now());
    // Pausa longa: fecha o socket em vez de mantê-lo vivo (retomar pede token novo).
    if (!ouvir && socket && pausadoDesde !== null && performance.now() - pausadoDesde >= PAUSA_MAXIMA_MS) limparSocket();
    else if (socket && pronto && pendentes.length) escoar(!portao.aberto);
    else if (socket && pronto && !portao.aberto && performance.now() - ultimoEnvio >= MANTER_VIVO_MS) {
      enviarAudio(new Float32Array(AMOSTRAS_MANTER_VIVO));
    }
    if (estado.motor === "elevenlabs") {
      publicar({ ...estado, escutando: ouvir && pronto });
      if (ouvir && !socket && !conectando && repetir === null) void conectarScribe();
    } else if (estado.motor === "navegador") {
      if (!ouvir) publicar({ ...estado, escutando: false });
      else if (repetir === null) iniciarNavegador();
    }
  }

  if (!trilha || trilha.readyState !== "live") publicar({ motor: "nenhum", escutando: false, erro: "Microfone sem trilha de áudio ativa." });
  else if (opcoes.servidor && opcoes.sessaoId) publicar({ motor: "elevenlabs", escutando: false, erro: null });
  else usarNavegador();
  const monitor = setInterval(sincronizarAtividade, 200);
  const aoEncerrarTrilha = () => {
    publicar({ motor: "nenhum", escutando: false, erro: "Microfone encerrado." });
    parar();
  };
  trilha?.addEventListener("ended", aoEncerrarTrilha);
  function parar() {
    if (encerrado) return;
    encerrado = true;
    fimDaSessao = performance.now();
    clearInterval(monitor);
    cancelarRepeticao();
    limparSocket();
    limparAudio();
    trilha?.removeEventListener("ended", aoEncerrarTrilha);
    if (reconhecimento) {
      reconhecimento.onstart = reconhecimento.onend = reconhecimento.onresult = reconhecimento.onerror = null;
      try { reconhecimento.abort(); } catch {}
    }
    // O stream pertence a useMidiaLocal: suas trilhas nunca são paradas aqui.
  }
  return {
    ativar(valor) { if (valor) inicio ??= performance.now(); ativo = valor; sincronizarAtividade(); },
    parar,
    uso: () => ({
      audioEnviadoS: amostrasEnviadas / 16000,
      sessaoS: inicio === null ? 0 : Math.max(0, ((fimDaSessao ?? performance.now()) - inicio) / 1000),
    }),
  };
}

export function useTranscricao(opcoes: {
  stream: MediaStream | null;
  ativo: boolean;
  sessaoId: string | null;
  aoParcial?: (texto: string) => void;
  aoFinal?: (texto: string) => void;
  contexto?: "coding" | "quadro";
  servidor?: boolean;
}): EstadoEscuta {
  const { stream, ativo, sessaoId, aoParcial, aoFinal } = opcoes;
  const [estado, setEstado] = useState<EstadoEscuta>({ motor: "nenhum", escutando: false, erro: null });
  const callbacks = useRef({ aoParcial, aoFinal });
  const escuta = useRef<ReturnType<typeof criarEscutaTranscricao> | null>(null);
  // Scribe por padrão; "0" (demonstração) usa só a transcrição do navegador.
  const servidor = opcoes.servidor ?? (process.env.NEXT_PUBLIC_USAR_SERVIDOR !== "0");
  const contexto = opcoes.contexto ?? "coding";
  useEffect(() => { callbacks.current = { aoParcial, aoFinal }; }, [aoParcial, aoFinal]);
  useEffect(() => {
    if (!stream) {
      setEstado({ motor: "nenhum", escutando: false, erro: null });
      return;
    }
    const controle = criarEscutaTranscricao({
      stream, sessaoId, servidor, aoEstado: setEstado,
      obterToken: (id) => tokenTranscricao(id, contexto),
      aoTrecho: (trecho) => {
        if (trecho.final) {
          callbacks.current.aoParcial?.("");
          callbacks.current.aoFinal?.(trecho.texto);
        } else callbacks.current.aoParcial?.(trecho.texto);
      },
    });
    escuta.current = controle;
    return () => {
      escuta.current = null;
      controle.parar();
      const uso = controle.uso();
      // Economia do portão de voz nos dados reais: áudio cobrado pelo Scribe contra o tempo de sessão.
      if (uso.sessaoS > 0) {
        console.info("[transcrição] uso da sessão", {
          sessaoId, contexto, audioEnviadoS: Math.round(uso.audioEnviadoS), sessaoS: Math.round(uso.sessaoS),
        });
      }
    };
  }, [stream, sessaoId, servidor, contexto]);
  useEffect(() => { escuta.current?.ativar(ativo); }, [ativo, stream, sessaoId, servidor]);
  return estado;
}
