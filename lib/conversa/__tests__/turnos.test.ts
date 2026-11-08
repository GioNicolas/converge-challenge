import assert from "node:assert/strict";
import { test } from "node:test";
import { deveAguardarParaFalar, deveAnalisarLogoAposResposta, podeTomarTurno, respostaTerminouPorSilencio } from "../turnos";

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

const base = {
  agora: 100_000, ultimaFalaEm: 90_000, ultimaFalaDoAgenteEm: 80_000, ultimaAtividade: 85_000,
  limiteMs: 7_000, falaParcial: false, pedidosEmAndamento: 0, agenteFalando: false,
};
test("fim da resposta: só voz parada há mais que o limite termina", () => {
  assert.equal(respostaTerminouPorSilencio(base), true);
  assert.equal(respostaTerminouPorSilencio({ ...base, ultimaFalaEm: 93_001 }), false);
  assert.equal(respostaTerminouPorSilencio({ ...base, ultimaFalaEm: 93_000 }), true);
});
test("fim da resposta: desenhar ou digitar recentemente não termina", () => {
  assert.equal(respostaTerminouPorSilencio({ ...base, ultimaAtividade: 96_000 }), false);
  assert.equal(respostaTerminouPorSilencio({ ...base, ultimaAtividade: 93_000 }), true);
});
test("fim da resposta: o agente ter acabado de falar não termina", () => {
  assert.equal(respostaTerminouPorSilencio({ ...base, ultimaFalaDoAgenteEm: 97_000 }), false);
  assert.equal(respostaTerminouPorSilencio({ ...base, ultimaFalaDoAgenteEm: null }), true);
});
test("fim da resposta: fala parcial, pedido em andamento ou agente falando seguram", () => {
  assert.equal(respostaTerminouPorSilencio({ ...base, falaParcial: true }), false);
  assert.equal(respostaTerminouPorSilencio({ ...base, pedidosEmAndamento: 1 }), false);
  assert.equal(respostaTerminouPorSilencio({ ...base, agenteFalando: true }), false);
});
test("fim da resposta: na pergunta de continuação o limite é 30 s", () => {
  const seguimento = { ...base, limiteMs: 30_000 };
  assert.equal(respostaTerminouPorSilencio(seguimento), false);
  assert.equal(respostaTerminouPorSilencio({ ...seguimento, agora: 120_000 }), true);
  assert.equal(respostaTerminouPorSilencio({ ...seguimento, agora: 120_000, ultimaAtividade: 110_000 }), false);
});
