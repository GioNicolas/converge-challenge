import assert from "node:assert/strict";
import { test } from "node:test";
import { comFolga, FOLGA_ANTES_S, QUADROS_ANTES, QUADROS_DEPOIS, semId3 } from "./folga";

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
