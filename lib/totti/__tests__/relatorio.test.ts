import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ehPedidoDeRepeticao, fatoDeCobertura, REGRAS_DE_JUSTICA_DO_RELATORIO, semTermosInternos, textoCulpaOCandidatoPorPedido } from "../relatorio";

describe("textoCulpaOCandidatoPorPedido", () => {
  it("pega a culpa por pedir repetição e o encerramento com adjetivo", () => {
    for (const t of [
      "Candidato pediu repetições sucessivas e demonstrou dificuldade em acompanhar os questionamentos",
      "teve dificuldade constante para acompanhar as perguntas, pediu repetições sucessivas e optou por encerrar a entrevista abruptamente",
      "Pediu para repetir a pergunta várias vezes.",
      "Fez pedidos de esclarecimento o tempo todo.",
      "Não entendeu as perguntas do entrevistador.",
      "Encerrou a entrevista de forma abrupta.",
      "Desistiu da entrevista no meio.",
    ]) assert.equal(textoCulpaOCandidatoPorPedido(t), true, t);
  });

  it("não confunde com o domínio do problema nem com decisão técnica", () => {
    for (const t of [
      "Garantiu idempotência dos pedidos para evitar repetição de cobrança.",
      "Estados dos pedidos com repetições de mensagens tratadas por chave única.",
      "Desistiu do cache e usou uma fila para absorver o pico.",
      "Teve dificuldade para entender o gargalo do banco, mas chegou ao índice certo.",
      "Pedidos duplicados são descartados pelo id.",
    ]) assert.equal(textoCulpaOCandidatoPorPedido(t), false, t);
  });
});

describe("ehPedidoDeRepeticao", () => {
  it("reconhece pedidos de repetição e esclarecimento", () => {
    for (const t of [
      "Como é? O que que cê perguntou?",
      "O que você perguntou?",
      "Não entendi.",
      "Não entendi a pergunta",
      "Hã? Como assim?",
      "Pode repetir, por favor?",
      "Repete a pergunta",
      "Pode explicar de novo?",
      "Ah, como é?",
      "Qual é a pergunta?",
      "Desculpa, não ouvi direito.",
    ]) assert.equal(ehPedidoDeRepeticao(t), true, t);
  });

  it("reconhece correção ao entrevistador e pedido para encerrar", () => {
    assert.equal(ehPedidoDeRepeticao("Mas não tem nenhuma interrogação na ponta da seta"), true);
    assert.equal(ehPedidoDeRepeticao("Quero encerrar a entrevista."), true);
    assert.equal(ehPedidoDeRepeticao("Vou encerrar por aqui"), true);
  });

  it("fala com conteúdo nunca é pedido, mesmo começando por um", () => {
    for (const t of [
      "Me fala um pouco do volume, então.",
      "Não entendi, mas acho que usaria um cache na frente do banco",
      "Como é o fluxo de leitura? Eu colocaria um cache e um banco relacional.",
      "O que você perguntou? Ah, o volume: uns mil acessos por segundo.",
      "Não tem interrogação, mas o banco aguenta porque o volume é pequeno e a leitura passa pelo cache.",
      "",
      "   ",
    ]) assert.equal(ehPedidoDeRepeticao(t), false, t);
  });

  it("fala longa nunca é só um pedido", () => {
    assert.equal(ehPedidoDeRepeticao(Array(40).fill("como é?").join(" ")), false);
  });
});

describe("fatoDeCobertura", () => {
  it("diz duração e critérios sem prova, sem adjetivo", () => {
    assert.equal(
      fatoDeCobertura({ duracaoMin: 8, previstoMin: 15, criteriosSemProva: 3, totalCriterios: 6 }),
      "A entrevista durou 8 de 15 minutos; 3 de 6 critérios ficaram sem prova.",
    );
  });
  it("omite a duração quando a entrevista foi até o fim ou é desconhecida", () => {
    assert.equal(fatoDeCobertura({ duracaoMin: 15, previstoMin: 15, criteriosSemProva: 1, totalCriterios: 6 }), "1 de 6 critérios ficou sem prova.");
    assert.equal(fatoDeCobertura({ duracaoMin: null, previstoMin: 15, criteriosSemProva: 2, totalCriterios: 6 }), "2 de 6 critérios ficaram sem prova.");
    assert.equal(fatoDeCobertura({ duracaoMin: 15, previstoMin: 15, criteriosSemProva: 0, totalCriterios: 6 }), null);
  });
});

describe("semTermosInternos", () => {
  it("troca plin por pergunta, com a concordância", () => {
    assert.equal(semTermosInternos("respostas aos plins e ao plin"), "respostas às perguntas e à pergunta");
    assert.equal(semTermosInternos("Clicou no plin."), "Clicou na pergunta.");
    assert.doesNotMatch(semTermosInternos("os plins, dos plins, plins"), /plin/i);
  });
});

describe("regras de justiça", () => {
  it("cobrem repetição, contestação, comunicação, encerramento, genérico e jargão", () => {
    for (const trecho of ["repetir ou esclarecer", "o entrevistador pode ter errado", "Comunicação", "encerrada antes do tempo", "contradizer", "Aprofundar", "plin"]) {
      assert.ok(REGRAS_DE_JUSTICA_DO_RELATORIO.includes(trecho), trecho);
    }
  });
});
