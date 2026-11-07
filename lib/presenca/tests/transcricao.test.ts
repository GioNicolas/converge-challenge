import assert from "node:assert/strict";
import { test } from "node:test";
import {
  atualizarTranscricao, esperaParaReconectar, estadoInicialTranscricao, mensagemDeAudio,
  misturarMono, pcm16LE, reamostrar, urlDoScribe,
} from "../transcricao";

test("parciais substituem o texto e o final preserva o início do segmento", () => {
  const inicial = estadoInicialTranscricao();
  const a = atualizarTranscricao(inicial, { texto: "qual a", final: false, inicio: 100 }, "1");
  const b = atualizarTranscricao(a.estado, { texto: "qual a escala", final: false, inicio: 200 }, "1");
  assert.equal(b.trecho?.texto, "qual a escala");
  assert.equal(b.trecho?.inicio, 100);
  const final = atualizarTranscricao(b.estado, { texto: "Qual a escala?", final: true, inicio: 300 }, "1");
  assert.deepEqual(final.trecho, { texto: "Qual a escala?", final: true, inicio: 100 });
  assert.equal(final.estado.parcial, null);
  assert.equal(inicial.parcial, null);
});

test("finais repetidos e parciais atrasados são ignorados pela chave", () => {
  const a = atualizarTranscricao(estadoInicialTranscricao(), { texto: "sim", final: true, inicio: 0 }, "1");
  assert.equal(atualizarTranscricao(a.estado, { texto: "sim", final: true, inicio: 100 }, "1").trecho, null);
  assert.equal(atualizarTranscricao(a.estado, { texto: "si", final: false, inicio: 100 }, "1").trecho, null);
  assert.equal(atualizarTranscricao(a.estado, { texto: "sim", final: true, inicio: 200 }, "2").trecho?.texto, "sim");
});

test("keepalive repetido não repete callback e texto vazio limpa a parcial", () => {
  const a = atualizarTranscricao(estadoInicialTranscricao(), { texto: "  não\n sei ", final: false, inicio: 0 }, "1");
  assert.equal(a.trecho?.texto, "não sei");
  assert.equal(atualizarTranscricao(a.estado, { texto: "não sei", final: false, inicio: 1 }, "1").trecho, null);
  const vazio = atualizarTranscricao(a.estado, { texto: "", final: false, inicio: 10 }, "1");
  assert.equal(vazio.estado.parcial, null);
  assert.equal(vazio.trecho?.texto, "");
  assert.equal(atualizarTranscricao(a.estado, { texto: "", final: true, inicio: 10 }, "1").trecho?.final, false);
});

test("espera cresce e termina após cinco retentativas", () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, i) => esperaParaReconectar(i)), [500, 1000, 2000, 4000, 8000, null, null]);
  assert.equal(esperaParaReconectar(-1), null);
  assert.equal(esperaParaReconectar(1.5), null);
});

test("mistura estéreo em mono sem modificar os canais", () => {
  const a = new Float32Array([1, 0.5, -1]);
  const b = new Float32Array([-1, 0.5, 1]);
  assert.deepEqual([...misturarMono([a, b])], [0, 0.5, 0]);
  assert.deepEqual([...a], [1, 0.5, -1]);
  assert.equal(misturarMono([]).length, 0);
  assert.throws(() => misturarMono([a, new Float32Array(1)]), RangeError);
});

test("48 kHz vira 16 kHz com média de três amostras", () => {
  const origem = new Float32Array([0, 0.3, 0.6, 0.6, 0.9, 0.3]);
  const resultado = reamostrar(origem, 48000);
  assert.equal(resultado.amostras.length, 2);
  assert.ok(Math.abs(resultado.amostras[0] - 0.3) < 1e-6);
  assert.ok(Math.abs(resultado.amostras[1] - 0.6) < 1e-6);
  assert.deepEqual(resultado.estado, { soma: 0, peso: 0 });
});

test("reamostragem em blocos equivale ao áudio inteiro, sem deriva a 44,1 kHz", () => {
  const origem = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i * 0.1));
  const inteira = reamostrar(origem, 44100);
  const partes: number[] = [];
  let estado = { soma: 0, peso: 0 };
  for (let i = 0; i < origem.length; i += 1024) {
    const resultado = reamostrar(origem.slice(i, i + 1024), 44100, 16000, estado);
    estado = resultado.estado;
    partes.push(...resultado.amostras);
  }
  assert.equal(inteira.amostras.length, 16000);
  assert.deepEqual(partes, [...inteira.amostras]);
});

test("reamostragem preserva fragmentos entre chamadas e aceita taxa idêntica", () => {
  const estado = { soma: 0, peso: 0 };
  const primeira = reamostrar(new Float32Array([1, 1]), 48000, 16000, estado);
  assert.equal(primeira.amostras.length, 0);
  const segunda = reamostrar(new Float32Array([1]), 48000, 16000, primeira.estado);
  assert.deepEqual([...segunda.amostras], [1]);
  assert.deepEqual(estado, { soma: 0, peso: 0 });
  assert.deepEqual([...reamostrar(new Float32Array([1, 0, -1]), 16000).amostras], [1, 0, -1]);
  assert.throws(() => reamostrar(new Float32Array(), 0), RangeError);
});

test("PCM é 16 bits little-endian, limita picos e sanitiza amostras inválidas", () => {
  assert.deepEqual([...pcm16LE(new Float32Array([-2, -1, 0, 0.5, 1, 2, NaN]))], [
    0, 128, 0, 128, 0, 0, 0, 64, 255, 127, 255, 127, 0, 0,
  ]);
});

test("URL e mensagem seguem o protocolo e usam somente token temporário", () => {
  const url = new URL(urlDoScribe("temporário/+?"));
  assert.equal(url.origin, "wss://api.elevenlabs.io");
  assert.equal(url.pathname, "/v1/speech-to-text/realtime");
  assert.equal(url.searchParams.get("token"), "temporário/+?");
  assert.equal(url.searchParams.get("model_id"), "scribe_v2_realtime");
  assert.equal(url.searchParams.get("audio_format"), "pcm_16000");
  assert.equal(url.searchParams.get("commit_strategy"), "vad");
  assert.equal(url.searchParams.get("language_code"), "pt");
  assert.equal(url.searchParams.has("xi-api-key"), false);
  assert.deepEqual(JSON.parse(mensagemDeAudio(new Float32Array([0, 1]))), {
    message_type: "input_audio_chunk", audio_base_64: "AAD/fw==", commit: false, sample_rate: 16000,
  });
});
