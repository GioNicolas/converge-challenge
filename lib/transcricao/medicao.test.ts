import assert from "node:assert/strict";
import { test } from "node:test";
import { palavrasNormalizadas, taxaDeErroPorPalavra, termosAcertados } from "./medicao";

test("normaliza acento, caixa e pontuação", () => {
  assert.deepEqual(palavrasNormalizadas("Cê falou o quê à noite?"), ["ce", "falou", "o", "que", "a", "noite"]);
});

test("WER conta trocas, inserções e remoções sobre a referência", () => {
  assert.equal(taxaDeErroPorPalavra("dicionário de pares", "dicionário de pares"), 0);
  assert.equal(taxaDeErroPorPalavra("dicionário de pares", "funcionário de bares"), 2 / 3);
  assert.equal(taxaDeErroPorPalavra("o que tu acha", ""), 1);
  assert.equal(taxaDeErroPorPalavra("sim", "sim sim"), 1);
});

test("termosAcertados acha o termo inteiro na transcrição", () => {
  assert.deepEqual(termosAcertados(["two sum", "pilha"], "É um Two Sum, não uma pilhagem"), [
    { termo: "two sum", acertou: true }, { termo: "pilha", acertou: false },
  ]);
});
