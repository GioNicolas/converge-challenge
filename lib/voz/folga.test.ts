import assert from "node:assert/strict";
import { test } from "node:test";
import {
  comFolga, esquecerSaidaDeSom, FOLGA_ANTES_S, marcarSaidaDeSom, PARADA_LONGA_MS, QUADROS_ANTES, QUADROS_ANTES_DEPOIS_DE_PARADA,
  QUADROS_DEPOIS, quadrosAntesDaFala, segundosDeQuadros, semId3,
} from "./folga";

const alinhamento = { characters: ["o", "i"], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] };

test("tira a etiqueta ID3v2 do começo e deixa o resto", () => {
  const id3 = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 3, 1, 2, 3];
  assert.deepEqual([...semId3(Uint8Array.from([...id3, 0xff, 0xfb]))], [0xff, 0xfb]);
  assert.deepEqual([...semId3(Uint8Array.from([0xff, 0xfb, 9]))], [0xff, 0xfb, 9]);
});

test("põe quadros de silêncio nas duas pontas e desloca o alinhamento pelo silêncio de antes", () => {
  const voz = Uint8Array.from([0xff, 0xfb, 0x90, 0xc4, 7, 7]);
  const r = comFolga(voz, alinhamento);
  const quadro = (r.bytes.length - voz.length) / (QUADROS_ANTES + QUADROS_DEPOIS);
  assert.ok(Number.isInteger(quadro) && quadro > 100);
  assert.deepEqual([...r.bytes.subarray(0, 2)], [0xff, 0xfb]);
  assert.deepEqual([...r.bytes.subarray(quadro * QUADROS_ANTES, quadro * QUADROS_ANTES + voz.length)], [...voz]);
  assert.ok(FOLGA_ANTES_S > 0.2 && FOLGA_ANTES_S < 0.4);
  assert.deepEqual(r.alinhamento.character_start_times_seconds, [FOLGA_ANTES_S, 0.1 + FOLGA_ANTES_S]);
  assert.deepEqual(r.alinhamento.characters, alinhamento.characters);
});

test("folga maior na primeira fala e depois de a saída ficar parada", () => {
  esquecerSaidaDeSom();
  assert.equal(quadrosAntesDaFala(0), QUADROS_ANTES_DEPOIS_DE_PARADA);
  marcarSaidaDeSom(1000);
  assert.equal(quadrosAntesDaFala(1000 + PARADA_LONGA_MS), QUADROS_ANTES);
  assert.equal(quadrosAntesDaFala(1001 + PARADA_LONGA_MS), QUADROS_ANTES_DEPOIS_DE_PARADA);
  const folga = segundosDeQuadros(QUADROS_ANTES_DEPOIS_DE_PARADA);
  assert.ok(folga >= 0.6 && folga <= 0.8, `${folga} s`);
});

test("comFolga com mais quadros desloca o alinhamento pelo silêncio maior", () => {
  const alinhamento = { characters: ["o"], character_start_times_seconds: [0], character_end_times_seconds: [0.1] };
  const normal = comFolga(new Uint8Array([1, 2, 3]), alinhamento);
  const maior = comFolga(new Uint8Array([1, 2, 3]), alinhamento, QUADROS_ANTES_DEPOIS_DE_PARADA);
  assert.ok(maior.bytes.length > normal.bytes.length);
  assert.equal(maior.alinhamento.character_start_times_seconds[0], segundosDeQuadros(QUADROS_ANTES_DEPOIS_DE_PARADA));
});
