// O contador de decisões do simulador mostra a decisão aplicada, mesmo quando a fala dita não traz o campo `decisao`
// (a pergunta do passo seguinte, ou a fala fixa de encerramento). Turno de verdade, LLM e Jev falsos.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Classificacao } from "@/lib/pre-entrevista/classificador";
import { conduzirTurno } from "@/lib/pre-entrevista/turno";
import { CLASSIFICACAO, chatFalso, jevFalso, saida, sessaoAberta, type LeituraFalsa } from "@/lib/pre-entrevista/__tests__/apoio";
import { decisoesDoModelo } from "../decisoes";

const PERGUNTA = "Se o tempo acabar, o que conta mais: uma solução funcionando ou o caminho bem explicado?";
const RESUMO = "Vai ser live coding pra nível pleno. Vou olhar como ele escreve e explica o código.";
/** IA aplicada pesa mais e live coding não a mede: a abertura já oferece a troca para system design. */
const COM_IA: Classificacao = {
  ...CLASSIFICACAO,
  focus: [
    { area: "uso_ia", weight: 0.6 },
    { area: "tecnico", weight: 0.4 },
  ],
};
const comDecisao = (fala: string, decisao: string) => JSON.stringify({ fala, movimento: "responder", decisao });

type Turno = { ela: string; jev?: LeituraFalsa; totti: string };

async function conversar(turnos: Turno[], classificacao: Classificacao = CLASSIFICACAO) {
  const sessao = sessaoAberta([], classificacao);
  const deps = { chat: chatFalso(...turnos.map((t) => t.totti)).chat, ...jevFalso(...turnos.map((t) => t.jev ?? {})) };
  for (const turno of turnos) await conduzirTurno(sessao, turno.ela, deps);
  return sessao;
}

const ATE_O_RESUMO: Turno[] = [
  { ela: "isso, pode seguir", jev: { cobertura: { confirmou_inicio: 1 } }, totti: saida(PERGUNTA) },
  { ela: "a solução funcionando, e reprova quem copia sem entender", jev: { cobertura: { criterio_tecnico: 1, eliminatorios: 1 } }, totti: saida(RESUMO) },
];

describe("decisoesDoModelo: lê a decisão do evento que a aplica", () => {
  it("troca: o modelo devolve 'trocar' e a fala é a pergunta seguinte", async () => {
    const sessao = await conversar([{ ela: "a primeira opção que você falou", totti: comDecisao("Fechado, a primeira.", "trocar") }, { ela: "-", totti: saida(PERGUNTA) }], COM_IA);
    // A fala dita não traz o campo: era daí que saía "sem campo".
    const falas = sessao.logs.filter((e) => e.tipo === "fala_agente").map((e) => (e.dados as { decisao?: string }).decisao);
    assert.ok(falas.every((d) => d === undefined));
    assert.deepEqual(decisoesDoModelo(sessao.logs), ["troca:trocar"]);
  });

  it("resumo: aprovação encerra com a fala fixa e conta 'finalizar'", async () => {
    const sessao = await conversar([...ATE_O_RESUMO, { ela: "manda bala", totti: comDecisao("Fechado.", "finalizar") }]);
    assert.deepEqual(decisoesDoModelo(sessao.logs), ["resumo:finalizar"]);
  });

  it("valor inválido conta como 'adiar'; campo ausente, como 'sem campo'", async () => {
    const invalida = await conversar([{ ela: "sei lá", totti: comDecisao("Quer trocar, deixar pra próxima etapa ou seguir sem?", "talvez") }], COM_IA);
    assert.deepEqual(decisoesDoModelo(invalida.logs), ["troca:adiar"]);
    const ausente = await conversar([{ ela: "sei lá", totti: saida("Quer trocar, deixar pra próxima etapa ou seguir sem?") }], COM_IA);
    assert.deepEqual(decisoesDoModelo(ausente.logs), ["troca:sem campo"]);
  });

  it("decisão pelos sinais não conta: não foi ao modelo", async () => {
    const sessao = await conversar([{ ela: "deixa pra próxima etapa", jev: { sinais: { escolheu_proxima_etapa: 1 } }, totti: saida(PERGUNTA) }], COM_IA);
    assert.deepEqual(decisoesDoModelo(sessao.logs), []);
  });
});
