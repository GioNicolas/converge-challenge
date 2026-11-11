import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ehItemGenerico,
  ehPedidoDeRepeticao,
  falaDeProximaConversa,
  fatoDeCobertura,
  mencionaDuracao,
  normalizarParaComparar,
  REGRAS_DE_JUSTICA_DO_RELATORIO,
  semTermosInternos,
  textoCulpaOCandidatoPorPedido,
} from "../relatorio";

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

describe("textoCulpaOCandidatoPorPedido: esclarecer o problema não é culpa", () => {
  it("perguntar sobre requisitos, escala, limites ou volume é bom sinal", () => {
    for (const t of [
      "Pediu para esclarecer o volume de acessos antes de desenhar.",
      "Candidato solicitou esclarecimentos sobre a escala antes de propor a arquitetura",
      "Pediu para esclarecer os limites da entrada antes de codar",
    ]) assert.equal(textoCulpaOCandidatoPorPedido(t), false, t);
  });

  it("esclarecer a pergunta do entrevistador ainda é culpa", () => {
    for (const t of [
      "Pediu esclarecimento da pergunta.",
      "Precisou que o entrevistador esclarecesse a pergunta.",
      "Não entendeu a pergunta do entrevistador.",
      "Pediu para repetir a pergunta.",
      "Teve dificuldade em acompanhar as perguntas.",
      "Encerrou a entrevista abruptamente.",
    ]) assert.equal(textoCulpaOCandidatoPorPedido(t), true, t);
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

  it("reconhece 'cê disse que tinha um quê?' e a negativa curta sobre a interrogação", () => {
    for (const t of ["Cê disse que tinha um quê?", "Mas não tem interrogação aí", "Não desenhei nenhuma interrogação", "Como é? O que que cê perguntou?", "Pode repetir a pergunta?", "Como assim?", "Não entendi"]) {
      assert.equal(ehPedidoDeRepeticao(t), true, t);
    }
  });

  it("explicação do desenho é conteúdo, não pedido", () => {
    for (const t of [
      "Não coloquei seta do cache pro banco porque a leitura é assíncrona",
      "Não tem seta entre a fila e o worker porque ele puxa sozinho",
    ]) assert.equal(ehPedidoDeRepeticao(t), false, t);
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

describe("fatoDeCobertura com minutos crus", () => {
  it("sessão de 14,83 de 15 minutos não diz duração", () => {
    assert.equal(fatoDeCobertura({ duracaoMin: 14.83, previstoMin: 15, criteriosSemProva: 1, totalCriterios: 6 }), "1 de 6 critérios ficou sem prova.");
    assert.equal(fatoDeCobertura({ duracaoMin: 14.83, previstoMin: 15, criteriosSemProva: 0, totalCriterios: 6 }), null);
  });
  it("8,7 de 15 minutos diz 8 de 15 (para baixo)", () => {
    assert.equal(
      fatoDeCobertura({ duracaoMin: 8.7, previstoMin: 15, criteriosSemProva: 2, totalCriterios: 6 }),
      "A entrevista durou 8 de 15 minutos; 2 de 6 critérios ficaram sem prova.",
    );
  });
});

describe("normalizarParaComparar", () => {
  it("minúsculas, sem acento, só letras e números, espaços simples", () => {
    assert.equal(normalizarParaComparar("  Ação, NÃO!  Faça-já 2x. "), "acao nao faca ja 2x");
    assert.equal(normalizarParaComparar("???"), "");
  });
});

describe("ehItemGenerico", () => {
  it("pega só o tema", () => {
    for (const t of ["Aprofundar Requisitos e escopo.", "aprofundar escalabilidade", "  Aprofundar Comunicação.  "]) assert.equal(ehItemGenerico(t), true, t);
  });
  it("não pega item com fato", () => {
    for (const t of [
      "Aprofundar o porquê do cache: não explicou a invalidação.",
      "Aprofundar cache, fila e banco.",
      "Pedir que aprofunde o cache.",
      "Aprofundarem o tema.",
      `Aprofundar ${"x".repeat(90)}.`,
    ]) assert.equal(ehItemGenerico(t), false, t);
  });
});

describe("falaDeProximaConversa e mencionaDuracao", () => {
  it("acha próxima conversa ou etapa", () => {
    assert.equal(falaDeProximaConversa("Perguntar na Próxima conversa sobre o cache."), true);
    assert.equal(falaDeProximaConversa("Na próxima etapa, aprofundar."), true);
    assert.equal(falaDeProximaConversa("Explicou o cache."), false);
  });
  it("acha a palavra durou", () => {
    assert.equal(mencionaDuracao("A entrevista durou 8 de 15 minutos."), true);
    assert.equal(mencionaDuracao("Resolveu o exercício."), false);
    assert.equal(mencionaDuracao("A duração foi curta."), false);
  });
});

describe("semTermosInternos", () => {
  it("troca plin por pergunta, com a concordância", () => {
    assert.equal(semTermosInternos("respostas aos plins e ao plin"), "respostas às perguntas e à pergunta");
    assert.equal(semTermosInternos("Clicou no plin."), "Clicou na pergunta.");
    assert.equal(semTermosInternos("os plins, dos plins, plins"), "as perguntas, das perguntas, perguntas");
    assert.equal(semTermosInternos("Nos plins e no plin; do plin. O plin"), "nas perguntas e na pergunta; da pergunta. a pergunta");
  });
  it("não mexe em outras palavras", () => {
    assert.equal(semTermosInternos("O plinto e o plinth ficam"), "O plinto e o plinth ficam");
    assert.equal(semTermosInternos("áplin plins2"), "áplin plins2");
  });
});

describe("regras de justiça", () => {
  it("cobrem repetição, contestação, comunicação, encerramento, genérico e jargão", () => {
    for (const trecho of ["repetir ou esclarecer", "o entrevistador pode ter errado", "Comunicação", "encerrada antes do tempo", "contradizer", "Aprofundar", "plin"]) {
      assert.ok(REGRAS_DE_JUSTICA_DO_RELATORIO.includes(trecho), trecho);
    }
  });
});
