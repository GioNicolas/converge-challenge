import assert from "node:assert/strict";
import { test } from "node:test";
import { acrescentarFala, erroMicrofone, type EventosTranscricao } from "./tipos";
import { iniciarNavegador, type ConstrutorReconhecimento } from "./navegador";
import { iniciarScribe } from "./scribe";
import { RealtimeEvents, type RealtimeConnection } from "@elevenlabs/client";

function coletar() {
  const textos: string[] = [];
  const parciais: string[] = [];
  const erros: string[] = [];
  let encerramentos = 0;
  const eventos: EventosTranscricao = {
    aoTexto: (texto) => textos.push(texto),
    aoParcial: (texto) => parciais.push(texto),
    aoErro: (erro) => erros.push(erro.message),
    aoEncerrar: () => { encerramentos++; },
  };
  return { eventos, textos, parciais, erros, get encerramentos() { return encerramentos; } };
}

class ReconhecimentoFalso {
  static atual: ReconhecimentoFalso;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: InstanceType<ConstrutorReconhecimento>["onresult"] = null;
  onerror: ((evento: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  abortado = false;
  parou = false;
  constructor() { ReconhecimentoFalso.atual = this; }
  start() {}
  stop() { this.parou = true; }
  abort() { this.abortado = true; }
  resultado(textos: [string, boolean][], resultIndex = 0) {
    this.onresult?.({ resultIndex, results: textos.map(([transcript, isFinal]) => ({ 0: { transcript }, isFinal })) });
  }
}

test("ditado preserva texto existente e separa falas com espaço", () => {
  assert.equal(acrescentarFala("Preciso de alguém.\n", " Com experiência em Python. "), "Preciso de alguém. Com experiência em Python.");
  assert.equal(acrescentarFala("", " Olá. "), "Olá.");
});

test("navegador separa parciais e confirma cada índice uma única vez", () => {
  const c = coletar();
  const sessao = iniciarNavegador(ReconhecimentoFalso, c.eventos);
  const r = ReconhecimentoFalso.atual;
  assert.equal(r.lang, "pt-BR");
  r.resultado([["Quero", false]]);
  assert.deepEqual(c.textos, []);
  r.resultado([["Quero Python.", true], ["e", false]]);
  r.resultado([["Quero Python.", true], ["e React.", true]]);
  r.resultado([["Quero Python.", true], ["e React.", true]]);
  assert.deepEqual(c.textos, ["Quero Python.", "e React."]);
  assert.ok(c.parciais.includes("e"));
  sessao.cancelar();
});

test("parar espera a última fala do navegador; cancelar ignora callbacks atrasados", async () => {
  const c = coletar();
  const sessao = iniciarNavegador(ReconhecimentoFalso, c.eventos);
  const r = ReconhecimentoFalso.atual;
  let terminou = false;
  const parada = sessao.parar().then(() => { terminou = true; });
  await Promise.resolve();
  assert.equal(terminou, false);
  assert.equal(r.parou, true);
  r.resultado([["Última palavra.", true]]);
  r.onend?.();
  await parada;
  assert.deepEqual(c.textos, ["Última palavra."]);
  assert.equal(c.encerramentos, 1);

  const outra = iniciarNavegador(ReconhecimentoFalso, c.eventos);
  const antigo = ReconhecimentoFalso.atual.onresult;
  outra.cancelar();
  antigo?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "descartar" } }] });
  assert.equal(c.textos.length, 1);
  assert.equal(ReconhecimentoFalso.atual.abortado, true);
});

test("permissão negada encerra a captura e permite uma nova tentativa", () => {
  const c = coletar();
  iniciarNavegador(ReconhecimentoFalso, c.eventos);
  ReconhecimentoFalso.atual.onerror?.({ error: "not-allowed" });
  assert.match(c.erros[0], /Permita/);
  assert.equal(c.encerramentos, 1);
  assert.equal(ReconhecimentoFalso.atual.abortado, true);
  assert.match(erroMicrofone(new DOMException("denied", "NotAllowedError")).message, /Permita/);
});

function scribeFalso() {
  const listeners = new Map<string, ((data: unknown) => void)[]>();
  let fechado = false;
  let capturaCancelada = false;
  let capturaParada = false;
  let signalCaptura: AbortSignal | undefined;
  let enviarAudio: ((audio: string) => void) | undefined;
  let commits = 0;
  let bytesEnviados = 0;
  const emit = (evento: RealtimeEvents, data: unknown = undefined) => listeners.get(evento)?.forEach((cb) => cb(data));
  const conexao = {
    on: (evento: string, cb: (data: unknown) => void) => listeners.set(evento, [...(listeners.get(evento) ?? []), cb]),
    close: () => { fechado = true; emit(RealtimeEvents.CLOSE); },
    send: ({ audioBase64 }: { audioBase64: string }) => { bytesEnviados += atob(audioBase64).length; },
    commit: () => { commits++; },
  } as unknown as RealtimeConnection;
  const dependencias: Parameters<typeof iniciarScribe>[1] = {
    conectar: () => {
      queueMicrotask(() => emit(RealtimeEvents.SESSION_STARTED, {}));
      return conexao;
    },
    capturar: async ({ aoAudio, signal }) => {
      signalCaptura = signal;
      enviarAudio = aoAudio;
      return {
        cancelar: () => { capturaCancelada = true; },
        parar: async () => { capturaParada = true; },
      };
    },
  };
  return {
    dependencias, emit,
    audio: () => enviarAudio?.("AAAA"),
    get fechado() { return fechado; },
    get capturaCancelada() { return capturaCancelada; },
    get capturaParada() { return capturaParada; },
    get signalCaptura() { return signalCaptura; },
    get commits() { return commits; },
    get bytesEnviados() { return bytesEnviados; },
  };
}

test("Scribe faz commit e mantém a última fala ao parar", async () => {
  const c = coletar();
  const falso = scribeFalso();
  const sessao = await iniciarScribe({ token: "teste", signal: new AbortController().signal, eventos: c.eventos }, falso.dependencias);
  falso.audio();
  falso.emit(RealtimeEvents.PARTIAL_TRANSCRIPT, { text: "Fala final" });
  assert.deepEqual(c.textos, []);
  const parada = sessao.parar();
  await Promise.resolve();
  assert.equal(falso.capturaParada, true);
  assert.equal(falso.fechado, false);
  assert.equal(falso.commits, 1);
  assert.equal(falso.bytesEnviados, 64000); // completa 2 s sem apagar uma fala curta
  falso.emit(RealtimeEvents.COMMITTED_TRANSCRIPT, { text: "Fala final." });
  await parada;
  assert.deepEqual(c.textos, ["Fala final."]);
  assert.equal(falso.fechado, true);
  assert.equal(falso.capturaCancelada, true);
  assert.equal(c.encerramentos, 1);
});

test("Scribe cancela recursos e não publica transcrições depois do abort", async () => {
  const c = coletar();
  const falso = scribeFalso();
  const controlador = new AbortController();
  await iniciarScribe({ token: "teste", signal: controlador.signal, eventos: c.eventos }, falso.dependencias);
  controlador.abort();
  falso.emit(RealtimeEvents.COMMITTED_TRANSCRIPT, { text: "descartar" });
  assert.deepEqual(c.textos, []);
  assert.equal(falso.fechado, true);
  assert.equal(falso.signalCaptura?.aborted, true);
  assert.equal(c.encerramentos, 1);
});

test("commit anterior não dispensa a finalização do áudio seguinte", async () => {
  const c = coletar();
  const falso = scribeFalso();
  const sessao = await iniciarScribe({ token: "teste", signal: new AbortController().signal, eventos: c.eventos }, falso.dependencias);
  falso.audio();
  falso.audio();
  falso.emit(RealtimeEvents.COMMITTED_TRANSCRIPT, { text: "Primeiro segmento." });
  const parada = sessao.parar();
  await Promise.resolve();
  assert.equal(falso.commits, 1);
  assert.equal(falso.fechado, false);
  falso.emit(RealtimeEvents.COMMITTED_TRANSCRIPT, { text: "Segundo segmento." });
  await parada;
  assert.deepEqual(c.textos, ["Primeiro segmento.", "Segundo segmento."]);
});

test("Scribe informa queda de conexão e solta o microfone", async () => {
  const c = coletar();
  const falso = scribeFalso();
  await iniciarScribe({ token: "teste", signal: new AbortController().signal, eventos: c.eventos }, falso.dependencias);
  falso.emit(RealtimeEvents.CLOSE);
  assert.equal(c.erros.length, 1);
  assert.equal(falso.capturaCancelada, true);
  assert.equal(c.encerramentos, 1);
});
