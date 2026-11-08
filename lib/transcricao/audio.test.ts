import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { capturarAudio } from "./captura";

test("worklet produz PCM little-endian, limita amplitude e drena o último bloco", () => {
  const enviados: (ArrayBuffer | string)[] = [];
  let Processor: new () => {
    port: { onmessage: (evento: { data: string }) => void };
    process: (inputs: Float32Array[][]) => boolean;
  };
  class AudioWorkletProcessorFalso {
    port = { onmessage: null, postMessage: (data: ArrayBuffer | string) => enviados.push(data) };
  }
  runInNewContext(readFileSync(new URL("../../public/audio/transcricao-processor.js", import.meta.url), "utf8"), {
    AudioWorkletProcessor: AudioWorkletProcessorFalso,
    sampleRate: 16000,
    registerProcessor: (nome: string, construtor: typeof Processor) => {
      assert.equal(nome, "transcricao-pcm");
      Processor = construtor;
    },
  });
  const processador = new Processor!();
  const amostras = new Float32Array(1601);
  amostras.set([-2, -1, 0, 1, 2]);
  amostras[1600] = 0.5;
  processador.process([[amostras]]);
  assert.equal(enviados.length, 1);
  const primeiro = new DataView(enviados[0] as ArrayBuffer);
  assert.equal(primeiro.byteLength, 3200);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => primeiro.getInt16(i * 2, true)), [-32768, -32768, 0, 32767, 32767]);
  processador.port.onmessage({ data: "finalizar" });
  assert.equal(new DataView(enviados[1] as ArrayBuffer).getInt16(0, true), 16383);
  assert.equal(enviados[2], "finalizado");
  assert.equal(processador.process([[amostras]]), false);
});

test("permissão resolvida depois de cancelar não deixa o microfone ligado", async () => {
  const mediaDevices = navigator.mediaDevices;
  let resolver: (stream: MediaStream) => void = () => {};
  let parou = false;
  const pendente = new Promise<MediaStream>((resolve) => { resolver = resolve; });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => pendente } });
  try {
    const controlador = new AbortController();
    const captura = capturarAudio({ signal: controlador.signal, aoAudio: () => {} });
    controlador.abort();
    resolver({ getTracks: () => [{ stop: () => { parou = true; } }] } as unknown as MediaStream);
    await assert.rejects(captura, { name: "AbortError" });
    assert.equal(parou, true);
  } finally {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: mediaDevices });
  }
});
