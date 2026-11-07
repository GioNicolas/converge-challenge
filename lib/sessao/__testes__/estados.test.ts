import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estadoInicial,
  podeAnalisar,
  transicionar,
  type EstadoEntrevista,
  type EventoEntrevista,
} from "../estados";
import type { RespostaAnalise } from "../cliente";

const duvida: RespostaAnalise = {
  status: "duvida",
  pergunta: "Onde está o gargalo?",
  nota: "Gargalo?",
  elementos: ["e1"],
  degrau: null,
  observacoes: [],
};
const ok: RespostaAnalise = { ...duvida, status: "ok", pergunta: null, nota: null, elementos: [] };

function rodar(eventos: [EventoEntrevista, number][], inicio: EstadoEntrevista = estadoInicial()) {
  return eventos.reduce((e, [ev, t]) => transicionar(e, ev, t), inicio);
}

function noAprofundamento(): EstadoEntrevista {
  return { ...estadoInicial(), fase: "APROFUNDAMENTO", faseIniciadaEm: 0 };
}

test("fases seguem a ordem: começar, apresentação, requisitos, desenho", () => {
  const e = rodar([
    [{ tipo: "COMECAR" }, 0],
    [{ tipo: "APRESENTACAO_TERMINOU" }, 10],
    [{ tipo: "CANDIDATO_DESENHOU" }, 20],
  ]);
  assert.equal(e.fase, "ALTO_NIVEL");
  assert.equal(e.faseIniciadaEm, 20);
});

test("tempo da fase acabando avança até encerrar", () => {
  const e = rodar(
    Array.from({ length: 4 }, (_, i) => [{ tipo: "TEMPO_DA_FASE_ACABOU" } as EventoEntrevista, i]),
    { ...estadoInicial(), fase: "REQUISITOS" },
  );
  assert.equal(e.fase, "ENCERRADA");
});

test("requisitos não analisa; pergunta ativa também não", () => {
  assert.equal(podeAnalisar({ ...estadoInicial(), fase: "REQUISITOS" }), false);
  assert.equal(podeAnalisar(noAprofundamento()), true);
  assert.equal(podeAnalisar({ ...noAprofundamento(), plin: "PERGUNTA_ATIVA" }), false);
});

test("ciclo completo do plin no aprofundamento", () => {
  let e = transicionar(noAprofundamento(), { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 1_000);
  assert.equal(e.plin, "PLIN_PENDENTE");
  e = transicionar(e, { tipo: "PLIN_CLICADO" }, 2_000);
  assert.equal(e.plin, "PERGUNTA_ATIVA");
  assert.equal(e.perguntasFeitas, 1);
  assert.equal(e.perguntaAtiva?.numero, 1);
  e = transicionar(e, { tipo: "RESPOSTA_TERMINOU" }, 5_000);
  assert.equal(e.plin, "LIVRE");
  assert.equal(e.ultimaRespostaEm, 5_000);
});

test("respeita 60s entre perguntas", () => {
  const depois = { ...noAprofundamento(), ultimaRespostaEm: 10_000 };
  const cedo = transicionar(depois, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 69_999);
  assert.equal(cedo.plin, "LIVRE");
  const tarde = transicionar(depois, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 70_000);
  assert.equal(tarde.plin, "PLIN_PENDENTE");
});

test("máximo de 5 perguntas; a quinta resposta leva ao fechamento", () => {
  const quase = { ...noAprofundamento(), perguntasFeitas: 4 };
  let e = transicionar(quase, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 0);
  e = transicionar(e, { tipo: "PLIN_CLICADO" }, 1);
  e = transicionar(e, { tipo: "RESPOSTA_TERMINOU" }, 2);
  assert.equal(e.perguntasFeitas, 5);
  assert.equal(e.fase, "FECHAMENTO");

  const cheio = { ...noAprofundamento(), perguntasFeitas: 5 };
  assert.equal(transicionar(cheio, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 0).plin, "LIVRE");
});

test("visão geral só aceita redirecionar", () => {
  const altoNivel = { ...estadoInicial(), fase: "ALTO_NIVEL" as const };
  assert.equal(transicionar(altoNivel, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 0).plin, "LIVRE");
  const redirecionar = { ...duvida, status: "redirecionar" as const };
  assert.equal(
    transicionar(altoNivel, { tipo: "ANALISE_RECEBIDA", resposta: redirecionar }, 0).plin,
    "PLIN_PENDENTE",
  );
});

test("dúvida nova substitui a pendente; 'ok' cancela a pendente", () => {
  let e = transicionar(noAprofundamento(), { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 0);
  const outra = { ...duvida, pergunta: "E se o cache cair?" };
  e = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: outra }, 1);
  assert.equal(e.perguntaPendente?.pergunta, "E se o cache cair?");
  e = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: ok }, 2);
  assert.equal(e.plin, "LIVRE");
  assert.equal(e.perguntaPendente, null);
});

test("plin de demonstração ignora fase, intervalo e limite, mas não atropela uma pergunta ativa", () => {
  const cheio = { ...estadoInicial(), fase: "REQUISITOS" as const, perguntasFeitas: 5, ultimaRespostaEm: 0 };
  assert.equal(transicionar(cheio, { tipo: "PLIN_DEMO", resposta: duvida }, 1).plin, "PLIN_PENDENTE");
  const ativa = { ...noAprofundamento(), plin: "PERGUNTA_ATIVA" as const };
  assert.equal(transicionar(ativa, { tipo: "PLIN_DEMO", resposta: duvida }, 1).plin, "PERGUNTA_ATIVA");
  assert.equal(transicionar(estadoInicial(), { tipo: "PLIN_DEMO", resposta: duvida }, 1).plin, "LIVRE");
});

test("um 'ok' da análise não cancela a pergunta de demonstração", () => {
  const demo = transicionar(noAprofundamento(), { tipo: "PLIN_DEMO", resposta: duvida }, 0);
  assert.equal(transicionar(demo, { tipo: "ANALISE_RECEBIDA", resposta: ok }, 1).plin, "PLIN_PENDENTE");
});

test("encerrada ignora tudo", () => {
  const fim = transicionar(noAprofundamento(), { tipo: "ENCERRAR" }, 0);
  assert.equal(fim.fase, "ENCERRADA");
  assert.equal(transicionar(fim, { tipo: "COMECAR" }, 1), fim);
});
