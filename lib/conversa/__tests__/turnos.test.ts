import assert from "node:assert/strict";
import { test } from "node:test";
import { deveAguardarParaFalar, podeTomarTurno } from "../turnos";

const pausa = { agora: 4000, ultimaFalaEm: 1000, falaParcial: false, agenteFalando: false, aguardandoResposta: false };
test("agente entra numa pausa sem exigir clique", () => {
  assert.equal(podeTomarTurno(pausa), true);
  assert.equal(podeTomarTurno({ ...pausa, agora: 3999 }), false);
});
test("pausa dentro de uma transcrição parcial não encerra o turno", () => {
  assert.equal(podeTomarTurno({ ...pausa, agora: 30000, falaParcial: true }), false);
});
test("intervenção de fundo aguarda a resposta direta e a reprodução da voz", () => {
  assert.equal(podeTomarTurno({ ...pausa, aguardandoResposta: true }), false);
  assert.equal(podeTomarTurno({ ...pausa, agenteFalando: true }), false);
});

test("resposta pronta espera a pausa, mas ruído constante não a prende", () => {
  const base = { agora: 10_000, esperandoDesde: 10_000, ultimaFalaEm: 9_800, falaParcial: false };
  assert.equal(deveAguardarParaFalar(base), true);
  assert.equal(deveAguardarParaFalar({ ...base, ultimaFalaEm: 9_000 }), false);
  assert.equal(deveAguardarParaFalar({ ...base, agora: 14_000, ultimaFalaEm: 13_900 }), false);
  assert.equal(deveAguardarParaFalar({ ...base, agora: 20_000, falaParcial: true }), true);
  assert.equal(deveAguardarParaFalar({ ...base, agora: 22_000, falaParcial: true }), false);
});
