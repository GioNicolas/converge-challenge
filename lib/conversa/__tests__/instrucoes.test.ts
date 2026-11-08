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

test("live coding cita a vaga e explica que o Totti acompanha o código por voz", () => {
  const fala = comoFuncionaLiveCoding(30, "Desenvolvedora Backend Pleno");
  assert.match(fala, /para a vaga de Desenvolvedora Backend Pleno/);
  assert.match(fala, /acompanhar o seu código o tempo todo/);
  assert.match(fala, /por voz/);
  assert.doesNotMatch(comoFuncionaLiveCoding(30), /para a vaga de/);
});
