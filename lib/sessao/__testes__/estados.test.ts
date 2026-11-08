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

test("sinal de prontidão do cérebro avança o alto nível para o aprofundamento", () => {
  const altoNivel: EstadoEntrevista = { ...estadoInicial(), fase: "ALTO_NIVEL", faseIniciadaEm: 0 };
  const pronto: RespostaAnalise = { ...ok, avancar_fase: true };
  // Cedo demais (menos de 30 s na fase): ignora.
  assert.equal(transicionar(altoNivel, { tipo: "ANALISE_RECEBIDA", resposta: pronto }, 10_000).fase, "ALTO_NIVEL");
  // Passado o mínimo: avança e marca o início da nova fase.
  const e = transicionar(altoNivel, { tipo: "ANALISE_RECEBIDA", resposta: pronto }, 45_000);
  assert.equal(e.fase, "APROFUNDAMENTO");
  assert.equal(e.faseIniciadaEm, 45_000);
  // Sem o sinal, não avança.
  assert.equal(transicionar(altoNivel, { tipo: "ANALISE_RECEBIDA", resposta: ok }, 45_000).fase, "ALTO_NIVEL");
});

test("sinal de prontidão não vale fora do alto nível nem com o candidato respondendo", () => {
  const pronto: RespostaAnalise = { ...ok, avancar_fase: true };
  assert.equal(transicionar(noAprofundamento(), { tipo: "ANALISE_RECEBIDA", resposta: pronto }, 90_000).fase, "APROFUNDAMENTO");
  const requisitos: EstadoEntrevista = { ...estadoInicial(), fase: "REQUISITOS", faseIniciadaEm: 0 };
  assert.equal(transicionar(requisitos, { tipo: "ANALISE_RECEBIDA", resposta: pronto }, 90_000).fase, "REQUISITOS");
  const respondendo: EstadoEntrevista = { ...estadoInicial(), fase: "ALTO_NIVEL", faseIniciadaEm: 0, plin: "PERGUNTA_ATIVA" };
  assert.equal(transicionar(respondendo, { tipo: "ANALISE_RECEBIDA", resposta: pronto }, 90_000).fase, "ALTO_NIVEL");
});

test("candidato concluiu no alto nível vai ao aprofundamento, sem mínimo de tempo", () => {
  const altoNivel: EstadoEntrevista = { ...estadoInicial(), fase: "ALTO_NIVEL", faseIniciadaEm: 0 };
  const e = transicionar(altoNivel, { tipo: "CANDIDATO_CONCLUIU" }, 1_000);
  assert.equal(e.fase, "APROFUNDAMENTO");
  assert.equal(e.faseIniciadaEm, 1_000);
  // Nas outras fases, ou respondendo a um plin, não muda nada.
  assert.equal(transicionar(noAprofundamento(), { tipo: "CANDIDATO_CONCLUIU" }, 1_000).fase, "APROFUNDAMENTO");
  const requisitos: EstadoEntrevista = { ...estadoInicial(), fase: "REQUISITOS", faseIniciadaEm: 0 };
  assert.equal(transicionar(requisitos, { tipo: "CANDIDATO_CONCLUIU" }, 1_000).fase, "REQUISITOS");
  assert.equal(transicionar({ ...altoNivel, plin: "PERGUNTA_ATIVA" }, { tipo: "CANDIDATO_CONCLUIU" }, 1_000).fase, "ALTO_NIVEL");
});

test("requisitos analisa (silêncio inicial); apresentação e pergunta ativa não", () => {
  assert.equal(podeAnalisar({ ...estadoInicial(), fase: "REQUISITOS" }), true);
  assert.equal(podeAnalisar({ ...estadoInicial(), fase: "APRESENTACAO" }), false);
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

function noFechamento(): EstadoEntrevista {
  return { ...estadoInicial(), fase: "FECHAMENTO", faseIniciadaEm: 0, perguntasFeitas: 5 };
}

test("fechamento aceita a dúvida final mesmo com 5 perguntas feitas e sem esperar 60s", () => {
  const acabouDeResponder = { ...noFechamento(), ultimaRespostaEm: 10_000 };
  let e = transicionar(acabouDeResponder, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 10_001);
  assert.equal(e.plin, "PLIN_PENDENTE");
  e = transicionar(e, { tipo: "PLIN_CLICADO" }, 10_002);
  assert.equal(e.plin, "PERGUNTA_ATIVA");
  assert.equal(e.perguntaAtiva?.numero, 6);
  assert.equal(e.perguntaFinalFeita, true);
  e = transicionar(e, { tipo: "RESPOSTA_TERMINOU" }, 20_000);
  assert.equal(e.fase, "FECHAMENTO");
  assert.equal(e.plin, "LIVRE");
});

test("fechamento faz a pergunta final uma vez só", () => {
  const jaFeita = { ...noFechamento(), perguntaFinalFeita: true };
  assert.equal(transicionar(jaFeita, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 999_999).plin, "LIVRE");
});

test("fechamento não atropela uma pergunta ativa e só aceita dúvida", () => {
  const ativa = { ...noFechamento(), plin: "PERGUNTA_ATIVA" as const };
  assert.equal(transicionar(ativa, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 0).plin, "PERGUNTA_ATIVA");
  for (const status of ["dica", "redirecionar"] as const) {
    const e = transicionar(noFechamento(), { tipo: "ANALISE_RECEBIDA", resposta: { ...duvida, status } }, 0);
    assert.equal(e.plin, "LIVRE");
  }
});

test("pergunta feita no aprofundamento não conta como a final", () => {
  let e = transicionar(noAprofundamento(), { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 0);
  e = transicionar(e, { tipo: "PLIN_CLICADO" }, 1);
  assert.equal(e.perguntaFinalFeita, false);
});

test("em requisitos só a dúvida vale e não gasta a cota; em alto nível dúvida e redirecionar valem", () => {
  const requisitos = { ...estadoInicial(), fase: "REQUISITOS" as const };
  const convite = transicionar(requisitos, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 0);
  assert.equal(convite.plin, "PLIN_PENDENTE");
  assert.equal(transicionar(requisitos, { tipo: "ANALISE_RECEBIDA", resposta: { ...duvida, status: "redirecionar" } }, 0).plin, "LIVRE");
  const clicado = transicionar(convite, { tipo: "PLIN_CLICADO" }, 1);
  assert.equal(clicado.plin, "PERGUNTA_ATIVA");
  assert.equal(clicado.perguntasFeitas, 0);
  const altoNivel = { ...estadoInicial(), fase: "ALTO_NIVEL" as const };
  assert.equal(transicionar(altoNivel, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, 0).plin, "PLIN_PENDENTE");
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
