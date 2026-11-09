import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cotaAte,
  interrupcaoAtrasada,
  intervaloMinimoMs,
  motivoDoMomento,
  motivoDoRitmo,
  orcamentoDeInterrupcoes,
  RITMO,
} from "../politica";

const MIN = 60_000;

test("orçamento escala com a duração, entre o mínimo e o máximo", () => {
  assert.equal(orcamentoDeInterrupcoes(15), 5);
  assert.equal(orcamentoDeInterrupcoes(30), 10);
  assert.equal(orcamentoDeInterrupcoes(35), 12);
  assert.equal(orcamentoDeInterrupcoes(5), RITMO.orcamentoMinimo);
  assert.equal(orcamentoDeInterrupcoes(90), RITMO.orcamentoMaximo);
  // Intervalo mínimo ~1,5 min nas durações usuais.
  assert.equal(intervaloMinimoMs(30), 90_000);
});

test("cota proporcional: não gasta o orçamento no começo", () => {
  assert.equal(cotaAte(0, 8), 1);
  assert.equal(cotaAte(0.25, 8), 3);
  assert.equal(cotaAte(1, 8), 8);
  const base = { agora: 5 * MIN, inicioEm: 0, duracaoMin: 30, ultimaEm: 1 * MIN };
  // Aos 5 de 30 min (cota 2), a terceira espera, mesmo depois de um marco.
  assert.match(motivoDoRitmo({ ...base, feitas: 2, marco: true })?.codigo ?? "", /cota/);
  assert.equal(motivoDoRitmo({ ...base, feitas: 1, ultimaEm: 2 * MIN }), null);
});

test("intervalo entre interrupções; o marco reduz ao respiro", () => {
  const base = { inicioEm: 0, duracaoMin: 30, feitas: 2, ultimaEm: 10 * MIN, ultimaConversaFimEm: 10 * MIN + 30_000 };
  assert.match(motivoDoRitmo({ ...base, agora: 11 * MIN + 20_000 })?.codigo ?? "", /intervalo/);
  assert.equal(motivoDoRitmo({ ...base, agora: 11 * MIN + 20_000, marco: true }), null);
  // Marco logo depois de uma conversa ainda respeita o respiro curto.
  assert.match(motivoDoRitmo({ ...base, agora: 10 * MIN + 40_000, marco: true })?.codigo ?? "", /respiro/);
  assert.equal(motivoDoRitmo({ ...base, agora: 10 * MIN + 50_000, marco: true }), null);
  assert.match(motivoDoRitmo({ ...base, feitas: 10, agora: 29 * MIN, marco: true })?.codigo ?? "", /orcamento/);
});

test("momento: nunca no meio da fala; mãos paradas, curta depois de marco, longa focado", () => {
  assert.match(motivoDoMomento({ maosParadasHaMs: 60_000, falaHaMs: 300 }) ?? "", /falando/);
  assert.match(motivoDoMomento({ maosParadasHaMs: 3_000, falaHaMs: Infinity }) ?? "", /ativo/);
  assert.equal(motivoDoMomento({ maosParadasHaMs: 3_000, falaHaMs: Infinity, marco: true }), null);
  assert.equal(motivoDoMomento({ maosParadasHaMs: 9_000, falaHaMs: 2_000 }), null);
  // Brecha curta na fala basta, desde que as mãos estejam paradas.
  assert.match(motivoDoMomento({ maosParadasHaMs: 9_000, falaHaMs: 1_000 }) ?? "", /falando/);
  assert.match(motivoDoMomento({ maosParadasHaMs: 9_000, falaHaMs: Infinity, focado: true }) ?? "", /melhoria/);
});

test("atraso: muito tempo sem interromper com cota livre", () => {
  const base = { inicioEm: 0, duracaoMin: 30, feitas: 2, ultimaEm: 5 * MIN };
  assert.equal(interrupcaoAtrasada({ ...base, agora: 9 * MIN }), false);
  assert.equal(interrupcaoAtrasada({ ...base, agora: 9 * MIN + 40_000 }), true);
  // Sem cota livre não é atraso.
  assert.equal(interrupcaoAtrasada({ ...base, feitas: 10, agora: 25 * MIN }), false);
});

test("paciência: quem não para de digitar ou desenhar também recebe pergunta numa pausa curta", () => {
  const ocupado = { maosParadasHaMs: 2_500, falaHaMs: Infinity };
  assert.match(motivoDoMomento(ocupado) ?? "", /ativo/);
  assert.equal(motivoDoMomento({ ...ocupado, esperandoHaMs: RITMO.pacienciaMs }), null);
  assert.equal(motivoDoMomento({ ...ocupado, atrasada: true }), null);
  // Mesmo com paciência, nunca no meio da fala.
  assert.match(motivoDoMomento({ ...ocupado, falaHaMs: 500, esperandoHaMs: 60_000 }) ?? "", /falando/);
});
