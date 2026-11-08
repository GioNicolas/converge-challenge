import assert from "node:assert/strict";
import { test } from "node:test";
import { aceitaPlin, estadoInicial, transicionar, type EstadoEntrevista } from "../estados";
import type { RespostaAnalise } from "../cliente";

const duvida: RespostaAnalise = {
  status: "duvida", pergunta: "Quer começar por onde?", nota: "Por onde?", elementos: [], degrau: null, observacoes: [],
};
const T = 1_000_000;

function emRequisitos(): EstadoEntrevista {
  return { ...estadoInicial(), fase: "REQUISITOS", faseIniciadaEm: T };
}

function fazerConvite(e: EstadoEntrevista, agora: number): EstadoEntrevista {
  const pendente = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, agora);
  const ativa = transicionar(pendente, { tipo: "PLIN_CLICADO" }, agora + 1000);
  return transicionar(ativa, { tipo: "RESPOSTA_TERMINOU" }, agora + 2000);
}

test("o convite de REQUISITOS não gasta a cota de perguntas", () => {
  const depois = fazerConvite(emRequisitos(), T);
  assert.equal(depois.perguntasFeitas, 0);
  assert.equal(depois.conviteFeito, true);
});

test("só um convite em REQUISITOS: o segundo duvida não vira plin", () => {
  const depois = fazerConvite(emRequisitos(), T);
  assert.equal(aceitaPlin(depois, duvida, T + 10 * 60_000), false);
  const tentativa = transicionar(depois, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, T + 10 * 60_000);
  assert.equal(tentativa.plin, "LIVRE");
});

test("a pergunta seguinte ganha um número diferente do convite", () => {
  const depois = fazerConvite(emRequisitos(), T);
  const alto: EstadoEntrevista = { ...depois, fase: "ALTO_NIVEL", faseIniciadaEm: T + 3000 };
  const pendente = transicionar(alto, { tipo: "ANALISE_RECEBIDA", resposta: duvida }, T + 120_000);
  const ativa = transicionar(pendente, { tipo: "PLIN_CLICADO" }, T + 121_000);
  assert.equal(ativa.perguntaAtiva?.numero, 2, "o convite foi a 1; a primeira pergunta da cota é a 2");
  assert.equal(ativa.perguntasFeitas, 1, "a cota conta só as perguntas reais");
});
