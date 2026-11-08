import assert from "node:assert/strict";
import { test } from "node:test";
import { acaoDaTecla, acaoDoEnter } from "./enterDoDitado";
import { deveFocarCampo } from "./focoDoDitado";

const enter = { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 };

test("Enter com o microfone ouvindo para o ditado, não envia", () => {
  assert.equal(acaoDoEnter("ouvindo"), "parar");
});

test("Enter enquanto o microfone conecta ou a transcrição finaliza não faz nada", () => {
  assert.equal(acaoDoEnter("conectando"), "esperar");
  assert.equal(acaoDoEnter("finalizando"), "esperar");
});

test("Enter com o microfone parado envia", () => {
  assert.equal(acaoDoEnter("inativa"), "enviar");
  assert.equal(acaoDoEnter("erro"), "enviar");
});

test("Shift+Enter e outras teclas seguem o comportamento do navegador", () => {
  assert.equal(acaoDaTecla({ ...enter, shiftKey: true }, "ouvindo"), null);
  assert.equal(acaoDaTecla({ ...enter, key: "a", keyCode: 65 }, "inativa"), null);
});

test("Enter que confirma composição de IME é ignorado, inclusive no Safari (keyCode 229)", () => {
  assert.equal(acaoDaTecla({ ...enter, isComposing: true }, "inativa"), null);
  assert.equal(acaoDaTecla({ ...enter, keyCode: 229 }, "inativa"), null);
});

test("Enter comum segue o estado do ditado", () => {
  assert.equal(acaoDaTecla(enter, "ouvindo"), "parar");
  assert.equal(acaoDaTecla(enter, "inativa"), "enviar");
});

test("Clique no microfone foca o campo com mouse ou teclado, mas não com toque", () => {
  assert.equal(deveFocarCampo("mouse"), true);
  assert.equal(deveFocarCampo(""), true);
  assert.equal(deveFocarCampo(undefined), true);
  assert.equal(deveFocarCampo("pen"), true);
  assert.equal(deveFocarCampo("touch"), false);
});
