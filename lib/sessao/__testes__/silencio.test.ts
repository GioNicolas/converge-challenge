import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deveForcarAnalise, type SituacaoDoSilencio } from "../silencio";

const AGORA = 1_000_000;
const base = (extra: Partial<SituacaoDoSilencio> = {}): SituacaoDoSilencio => ({
  agora: AGORA, fase: "ALTO_NIVEL", ultimaAtividade: AGORA - 60_000, ultimaFalaDoAgente: null, ultimoDisparo: 0, ...extra,
});

describe("deveForcarAnalise: silêncio do candidato no quadro", () => {
  it("sem fala do Totti depois da última ação, a primeira análise sai 8 s depois da ação", () => {
    assert.equal(deveForcarAnalise(base({ ultimaAtividade: AGORA - 7_900 })), false);
    assert.equal(deveForcarAnalise(base({ ultimaAtividade: AGORA - 8_100 })), true);
  });

  it("em REQUISITOS a primeira análise espera o silêncio inicial (120 s)", () => {
    assert.equal(deveForcarAnalise(base({ fase: "REQUISITOS", ultimaAtividade: AGORA - 100_000 })), false);
    assert.equal(deveForcarAnalise(base({ fase: "REQUISITOS", ultimaAtividade: AGORA - 121_000 })), true);
  });

  it("se o silêncio continua sem o Totti falar, repete a cada 30 s depois da primeira análise", () => {
    const disparou = AGORA - 10_000;
    assert.equal(deveForcarAnalise(base({ ultimaAtividade: AGORA - 60_000, ultimoDisparo: disparou })), false);
    assert.equal(deveForcarAnalise(base({ ultimaAtividade: AGORA - 60_000, ultimoDisparo: AGORA - 31_000 })), true);
  });

  it("depois de uma fala do Totti, espera 60 s de silêncio total, não 8 s", () => {
    const fala = AGORA - 20_000;
    const situacao = base({ ultimaAtividade: AGORA - 90_000, ultimaFalaDoAgente: fala });
    assert.equal(deveForcarAnalise(situacao), false);
    assert.equal(deveForcarAnalise({ ...situacao, ultimaFalaDoAgente: AGORA - 61_000 }), true);
  });

  it("uma quebra de silêncio por período: depois de disparar, não repete enquanto o candidato não agir", () => {
    const fala = AGORA - 61_000;
    const depois = base({ ultimaAtividade: AGORA - 120_000, ultimaFalaDoAgente: fala, ultimoDisparo: AGORA - 1_000 });
    assert.equal(deveForcarAnalise(depois), false);
    assert.equal(deveForcarAnalise({ ...depois, agora: AGORA + 600_000 }), false);
  });

  it("quando o candidato age de novo, o período recomeça: a próxima quebra espera 60 s da fala do Totti", () => {
    const fala = AGORA - 61_000;
    const agiu = base({ ultimaAtividade: AGORA - 5_000, ultimaFalaDoAgente: fala, ultimoDisparo: AGORA - 70_000 });
    // A ação é posterior à fala: volta à regra de antes (8 s depois da ação, sem disparo depois dela).
    assert.equal(deveForcarAnalise(agiu), false);
    assert.equal(deveForcarAnalise({ ...agiu, ultimaAtividade: AGORA - 9_000 }), true);
  });

  it("a fala do Totti que vem depois da ação do candidato conta como fala de quem tem a bola", () => {
    const situacao = base({ ultimaAtividade: AGORA - 30_000, ultimaFalaDoAgente: AGORA - 10_000 });
    assert.equal(deveForcarAnalise(situacao), false);
    assert.equal(deveForcarAnalise({ ...situacao, ultimaFalaDoAgente: AGORA - 61_000 }), true);
  });

  it("o pedido de tempo conta como fala do Totti: a espera de 60 s começa nele", () => {
    const pedido = AGORA - 20_000;
    const situacao = base({ ultimaAtividade: AGORA - 90_000, ultimaFalaDoAgente: null, pedidoDeTempoEm: pedido });
    assert.equal(deveForcarAnalise(situacao), false);
    assert.equal(deveForcarAnalise({ ...situacao, pedidoDeTempoEm: AGORA - 61_000 }), true);
    // Se ele agiu depois do pedido, volta a regra de sempre (8 s depois da ação).
    assert.equal(deveForcarAnalise({ ...situacao, pedidoDeTempoEm: AGORA - 61_000, ultimaAtividade: AGORA - 9_000 }), true);
    assert.equal(deveForcarAnalise({ ...situacao, pedidoDeTempoEm: AGORA - 61_000, ultimaAtividade: AGORA - 5_000 }), false);
  });

  it("fora das fases com silêncio (AGUARDANDO, ENCERRADA), nunca força análise", () => {
    assert.equal(deveForcarAnalise(base({ fase: "AGUARDANDO", ultimaAtividade: 0 })), false);
    assert.equal(deveForcarAnalise(base({ fase: "ENCERRADA", ultimaAtividade: 0 })), false);
  });

  it("no FECHAMENTO também força análise (a pergunta final sai por elas)", () => {
    assert.equal(deveForcarAnalise(base({ fase: "FECHAMENTO", ultimaAtividade: AGORA - 9_000 })), true);
  });
});
