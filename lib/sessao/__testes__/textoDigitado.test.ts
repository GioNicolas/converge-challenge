import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITE_TEXTO_DIGITADO, limparTextoDigitado } from "../textoDigitado";

test("apara espaços e normaliza quebras de linha", () => {
  assert.equal(limparTextoDigitado("  oi\r\ntudo bem?  \n"), "oi\ntudo bem?");
});

test("texto só com espaços vira vazio", () => {
  assert.equal(limparTextoDigitado(" \n\t "), "");
});

test("corta no limite", () => {
  assert.equal(limparTextoDigitado("a".repeat(LIMITE_TEXTO_DIGITADO + 50)).length, LIMITE_TEXTO_DIGITADO);
});
