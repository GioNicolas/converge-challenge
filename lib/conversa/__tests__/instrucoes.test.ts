import assert from "node:assert/strict";
import { test } from "node:test";
import { comoFuncionaLiveCoding, comoFuncionaQuadro } from "../instrucoes";

test("quadro diz a duração somando as fases e o combinado do não sei", () => {
  const texto = comoFuncionaQuadro({ REQUISITOS: 120, ALTO_NIVEL: 240, APROFUNDAMENTO: 180, FECHAMENTO: 60 });
  assert.match(texto, /uns 10 minutos/);
  assert.match(texto, /requisitos/);
  assert.match(texto, /não souber/);
});

test("quadro sem tempos não inventa duração", () => {
  assert.doesNotMatch(comoFuncionaQuadro({}), /minutos/);
});

test("live coding diz a duração da vaga", () => {
  assert.match(comoFuncionaLiveCoding(45), /uns 45 minutos/);
});

test("live coding é curto e dá o combinado essencial", () => {
  const fala = comoFuncionaLiveCoding(30);
  assert.ok(fala.length <= 200);
  assert.ok(fala.split(/[.!?]+/).filter((frase) => frase.trim()).length <= 3);
  assert.match(fala, /Totti/);
  assert.match(fala, /uns 30 minutos/);
  assert.match(fala, /à esquerda/);
  assert.match(fala, /pensa em voz alta/);
  assert.match(fala, /me chama quando quiser/);
});
