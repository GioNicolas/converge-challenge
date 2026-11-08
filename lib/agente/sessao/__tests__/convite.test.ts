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
    [{ tipo: "ANALISE_RECEBIDA", resposta: duvida }, T0 + 20_000],
    [{ tipo: "PLIN_CLICADO" }, T0 + 21_000],
    [{ tipo: "CANDIDATO_FALOU", texto: "Vamos lá", fimDeResposta: true }, T0 + 25_000],
  );
}

describe("convite único de REQUISITOS", () => {
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
    const alto = aplicar({ ...e }, [{ tipo: "CANDIDATO_DESENHOU" }, T0 + 30_000]);
    const depois = aplicar(
      alto,
      [{ tipo: "ANALISE_RECEBIDA", resposta: duvida }, T0 + 120_000],
      [{ tipo: "PLIN_CLICADO" }, T0 + 121_000],
    );
    assert.equal(depois.perguntaAtiva?.numero, 2);
    assert.equal(depois.perguntasFeitas, 1);
    assert.deepEqual(depois.perguntas.map((p) => p.numero), [1, 2]);
  });
});
