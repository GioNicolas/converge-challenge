import assert from "node:assert/strict";
import { test } from "node:test";
import { acaoDoEnter } from "./enterDoDitado";

test("Enter com o microfone ouvindo (ou conectando) para o ditado, não envia", () => {
  assert.equal(acaoDoEnter("ouvindo"), "parar");
  assert.equal(acaoDoEnter("conectando"), "parar");
});

test("Enter enquanto a transcrição finaliza não faz nada", () => {
  assert.equal(acaoDoEnter("finalizando"), "esperar");
});

test("Enter com o microfone parado envia", () => {
  assert.equal(acaoDoEnter("inativa"), "enviar");
  assert.equal(acaoDoEnter("erro"), "enviar");
});
