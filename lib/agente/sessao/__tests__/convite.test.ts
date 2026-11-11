import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estadoInicial, transicionar, type EstadoSessao, type EventoSessao } from "../estado";
import { motivoBloqueioPlin, podeLevantarPlin } from "../politica";
import type { RespostaAnalise } from "../tipos";

const T0 = 1_000_000;
const duvida: RespostaAnalise = {
  status: "duvida", pergunta: "Quer começar por onde?", nota: "Por onde?", elementos: [], degrau: null, observacoes: [],
};

function aplicar(estado: EstadoSessao, ...passos: [EventoSessao, number][]): EstadoSessao {
  return passos.reduce((e, [ev, t]) => transicionar(e, ev, t).estado, estado);
}

function emRequisitos(): EstadoSessao {
  return aplicar(estadoInicial(), [{ tipo: "COMECAR" }, T0], [{ tipo: "APRESENTACAO_TERMINOU" }, T0 + 1000]);
}

function comConvite(): EstadoSessao {
  return aplicar(
    emRequisitos(),
    [{ tipo: "ANALISE_RECEBIDA", resposta: duvida }, T0 + 121_000],
    [{ tipo: "PLIN_CLICADO" }, T0 + 122_000],
    [{ tipo: "CANDIDATO_FALOU", texto: "Vamos lá", fimDeResposta: true }, T0 + 125_000],
  );
}

describe("convite único de REQUISITOS", () => {
  it("fala dispensa o convite para sempre, sem pular o número da primeira pergunta", () => {
    const e = aplicar(emRequisitos(), [{ tipo: "CANDIDATO_FALOU", texto: "Qual o volume?", fimDeResposta: false }, T0 + 10_000]);
    assert.equal(e.conviteFeito, true);
    assert.equal(podeLevantarPlin(e, "duvida", T0 + 300_000), false);
    const depois = aplicar(e,
      [{ tipo: "CANDIDATO_DESENHOU" }, T0 + 30_000],
      [{ tipo: "ANALISE_RECEBIDA", resposta: duvida }, T0 + 300_000],
      [{ tipo: "PLIN_CLICADO" }, T0 + 301_000],
    );
    assert.equal(depois.perguntaAtiva?.numero, 1);
    assert.equal(depois.perguntasFeitas, 1);
  });

  it("fala cancela convite pendente antes do clique", () => {
    const pendente = aplicar(emRequisitos(), [{ tipo: "ANALISE_RECEBIDA", resposta: duvida }, T0 + 121_000]);
    assert.equal(pendente.plin, "PLIN_PENDENTE");
    const r = transicionar(pendente, { tipo: "CANDIDATO_FALOU", texto: "Vou começar", fimDeResposta: false }, T0 + 122_000);
    assert.equal(r.estado.conviteFeito, true);
    assert.equal(r.estado.perguntaPendente, null);
    assert.deepEqual(r.efeitos, [{ tipo: "PLIN_CANCELADO", motivo: "ok" }]);
    assert.equal(transicionar(r.estado, { tipo: "PLIN_CLICADO" }, T0 + 123_000).estado.perguntas.length, 0);
  });

  it("fim de resposta vazio não dispensa o convite", () => {
    const e = aplicar(emRequisitos(), [{ tipo: "CANDIDATO_FALOU", texto: "  ", fimDeResposta: true }, T0 + 10_000]);
    assert.equal(e.conviteFeito, false);
    assert.equal(podeLevantarPlin(e, "duvida", T0 + 121_000), true);
  });

  it("não conta na cota e marca conviteFeito", () => {
    const e = comConvite();
    assert.equal(e.perguntasFeitas, 0);
    assert.equal(e.conviteFeito, true);
  });

  it("depois dele, o plin em REQUISITOS é bloqueado", () => {
    const e = comConvite();
    assert.equal(motivoBloqueioPlin(e, T0 + 10 * 60_000), "LIMITE_DE_PERGUNTAS");
    assert.equal(podeLevantarPlin(e, "duvida", T0 + 10 * 60_000), false);
  });

  it("a próxima pergunta tem número diferente do convite e conta 1 na cota", () => {
    const e = comConvite();
    const alto = aplicar({ ...e }, [{ tipo: "CANDIDATO_DESENHOU" }, T0 + 130_000]);
    const depois = aplicar(
      alto,
      [{ tipo: "ANALISE_RECEBIDA", resposta: duvida }, T0 + 300_000],
      [{ tipo: "PLIN_CLICADO" }, T0 + 301_000],
    );
    assert.equal(depois.perguntaAtiva?.numero, 2);
    assert.equal(depois.perguntasFeitas, 1);
    assert.deepEqual(depois.perguntas.map((p) => p.numero), [1, 2]);
  });
});
