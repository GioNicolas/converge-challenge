import assert from "node:assert/strict";
import { test } from "node:test";
import { deveAguardarParaFalar, deveAnalisarLogoAposResposta, podeTomarTurno } from "../turnos";

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

test("resposta que já devolveu a vez não dispara análise na hora", () => {
  assert.equal(deveAnalisarLogoAposResposta("São 20 mil por dia. Pode seguir com o desenho.", false), false);
  assert.equal(deveAnalisarLogoAposResposta("São 20 mil por dia. Continua daí.", false), false);
  assert.equal(deveAnalisarLogoAposResposta("E se a fila atrasar, o que acontece?", false), false);
});
test("resposta que parou no fato ainda dispara a análise", () => {
  assert.equal(deveAnalisarLogoAposResposta("São 20 mil por dia.", false), true);
});
test("etapa concluída ou fala vazia não dispara análise por aqui", () => {
  assert.equal(deveAnalisarLogoAposResposta("São 20 mil por dia.", true), false);
  assert.equal(deveAnalisarLogoAposResposta("   ", false), false);
});
