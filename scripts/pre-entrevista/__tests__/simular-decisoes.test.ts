// O contador de decisões do simulador mostra o que o turno fez com cada decisão pendente, mesmo quando a fala dita é
// outra (a pergunta do passo seguinte, ou a fala fixa de encerramento). Turno de verdade, LLM e Jev falsos.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Classificacao } from "@/lib/pre-entrevista/classificador";
import { conduzirTurno, type DepsDoTurno } from "@/lib/pre-entrevista/turno";
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
const comDecisao = (fala: string, decisao: string, movimento = "responder") => JSON.stringify({ fala, movimento, decisao });

/** Um turno: o que ela diz, o que o Jev lê e as respostas do modelo nesse turno, na ordem das chamadas. */
type Turno = { ela: string; jev?: LeituraFalsa; totti: string[] };

/** O chat falso devolve as respostas na ordem; `null` é uma chamada que falha. */
function chatEmSequencia(respostas: (string | null)[]): DepsDoTurno["chat"] {
  let i = 0;
  return async (opcoes) => {
    const resposta = respostas[i++];
    if (resposta === undefined) throw new Error(`chamada ${i} ao modelo além do previsto`);
    if (resposta === null) throw new Error("modelo fora do ar");
    return chatFalso(resposta).chat(opcoes);
  };
}

async function conversar(turnos: (Omit<Turno, "totti"> & { totti: (string | null)[] })[], classificacao: Classificacao = CLASSIFICACAO) {
  const sessao = sessaoAberta([], classificacao);
  const deps = { chat: chatEmSequencia(turnos.flatMap((t) => t.totti)), ...jevFalso(...turnos.map((t) => t.jev ?? {})) };
  for (const turno of turnos) await conduzirTurno(sessao, turno.ela, deps);
  return sessao;
}

const ATE_O_RESUMO: Turno[] = [
  { ela: "isso, pode seguir", jev: { cobertura: { confirmou_inicio: 1 } }, totti: [saida(PERGUNTA)] },
  { ela: "a solução funcionando, e reprova quem copia sem entender", jev: { cobertura: { criterio_tecnico: 1, eliminatorios: 1 } }, totti: [saida(RESUMO)] },
];
const OFERTA_DE_NOVO = "Quer trocar, deixar pra próxima etapa ou seguir sem?";

describe("decisoesDoModelo: lê o que o turno fez com a decisão pendente", () => {
  it("troca: o modelo devolve 'trocar' e a fala dita é a pergunta seguinte", async () => {
    // Duas chamadas no mesmo turno: a decisão e a fala do passo seguinte.
    const sessao = await conversar([{ ela: "a primeira opção que você falou", totti: [comDecisao("Fechado, a primeira.", "trocar"), saida(PERGUNTA)] }], COM_IA);
    // A abertura também é uma fala do Totti; a do turno é a última.
    const falas = sessao.logs.filter((e) => e.tipo === "fala_agente").slice(-1);
    // A fala grava a decisão que o modelo devolveu, não a da segunda chamada.
    assert.equal((falas[0].dados as { decisao?: string }).decisao, "trocar");
    assert.deepEqual(decisoesDoModelo(sessao.logs), ["troca:trocar"]);
  });

  it("resumo: aprovação encerra com a fala fixa e conta 'finalizar'", async () => {
    const sessao = await conversar([...ATE_O_RESUMO, { ela: "manda bala", totti: [comDecisao("Fechado.", "finalizar")] }]);
    assert.deepEqual(decisoesDoModelo(sessao.logs), ["resumo:finalizar"]);
  });

  it("valor inválido conta como 'adiar' e mostra o valor; campo ausente, 'sem campo'", async () => {
    const invalida = await conversar([{ ela: "sei lá", totti: [comDecisao(OFERTA_DE_NOVO, "talvez")] }], COM_IA);
    assert.deepEqual(decisoesDoModelo(invalida.logs), ["troca:adiar (inválida: talvez)"]);
    const ausente = await conversar([{ ela: "sei lá", totti: [saida(OFERTA_DE_NOVO)] }], COM_IA);
    assert.deepEqual(decisoesDoModelo(ausente.logs), ["troca:sem campo"]);
  });

  it("o modelo falhou: conta 'falhou'", async () => {
    const sessao = await conversar([{ ela: "sei lá", totti: [null] }], COM_IA);
    assert.deepEqual(decisoesDoModelo(sessao.logs), ["troca:falhou"]);
  });

  it("o modelo esclareceu: conta 'não lida', mesmo com o campo preenchido", async () => {
    const sessao = await conversar([{ ela: "como assim?", totti: [comDecisao("A troca é fazer system design no lugar.", "trocar", "esclarecer")] }], COM_IA);
    assert.deepEqual(decisoesDoModelo(sessao.logs), ["troca:não lida (esclarecer)"]);
  });

  it("decisão pelos sinais não conta: não foi ao modelo", async () => {
    const sessao = await conversar([{ ela: "deixa pra próxima etapa", jev: { sinais: { escolheu_proxima_etapa: 1 } }, totti: [saida(PERGUNTA)] }], COM_IA);
    assert.deepEqual(decisoesDoModelo(sessao.logs), []);
  });
});
