import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KIT_SYSTEM_DESIGN } from "../kits/system-design";
import { cartaoDoScorecard } from "../resultados";
import type { CriterioAvaliado, Scorecard } from "../scorecard";

const [c1, c2, c3] = KIT_SYSTEM_DESIGN.criterios;

function criterio(id: string, nota: number | null, justificativa: string): CriterioAvaliado {
  return { criterio: id, nota, justificativa, evidencias: [] };
}

/** Scorecard base no formato novo. Sobrescreva o que o teste precisa. */
function scorecard(parcial: Partial<Scorecard> = {}): Scorecard {
  return {
    candidato_id: "c1",
    problema_id: "p1",
    nota_geral: 2.5,
    recomendacao: "avancar_com_ressalvas",
    criterios: [
      criterio(c1.id, 4, "Justificativa forte."),
      criterio(c2.id, 2, "Não estimou o volume de leituras."),
      criterio(c3.id, 1, "Não comparou consistência com disponibilidade."),
    ],
    pontos_fortes: ["Levantou requisitos antes de desenhar."],
    pontos_a_aprofundar: ["Dimensionamento de leitura: não estimou o volume."],
    briefing_para_proxima_etapa: "Aprofundar cache na próxima conversa.",
    resumo_da_solucao: "Uma API com banco relacional e cache na leitura.",
    resumo_da_entrevista: "Boa base, faltou estimar carga.",
    gerado_em: "2026-11-07T15:00:00.000Z",
    origem: "llm",
    ajustes: [],
    ...parcial,
  };
}

describe("cartaoDoScorecard", () => {
  it("o resumo é o resumo da entrevista, nunca o briefing da próxima etapa", () => {
    const cartao = cartaoDoScorecard(scorecard(), KIT_SYSTEM_DESIGN);
    assert.equal(cartao.resumo, "Boa base, faltou estimar carga.");
    assert.deepEqual(cartao.proximosPassos, ["Aprofundar cache na próxima conversa."]);
    assert.ok(!cartao.pontosFracos.includes("Aprofundar cache na próxima conversa."));
  });

  it("leva o que o candidato propôs", () => {
    const cartao = cartaoDoScorecard(scorecard(), KIT_SYSTEM_DESIGN);
    assert.equal(cartao.solucao, "Uma API com banco relacional e cache na leitura.");
  });

  it("sem resumo da entrevista, usa a justificativa do critério mais fraco (e não o briefing)", () => {
    const cartao = cartaoDoScorecard(scorecard({ resumo_da_entrevista: "" }), KIT_SYSTEM_DESIGN);
    assert.equal(cartao.resumo, "Não comparou consistência com disponibilidade.");
  });

  it("scorecard antigo (sem os campos novos): sem solução, pontos fracos das justificativas com nota até 2, no máximo 3", () => {
    const antigo = scorecard({
      resumo_da_solucao: undefined,
      resumo_da_entrevista: undefined,
      pontos_a_aprofundar: ["Trade-offs", "Escalabilidade"],
      criterios: [
        criterio(c1.id, 2, "Fraco A."),
        criterio(c2.id, 1, "Fraco B."),
        criterio(c3.id, 2, "Fraco C."),
        { criterio: "outro", nota: 1, justificativa: "Fraco D.", evidencias: [] },
        criterio("sem_nota", null, "Não deve aparecer."),
      ],
    });
    const cartao = cartaoDoScorecard(antigo, KIT_SYSTEM_DESIGN);
    assert.equal(cartao.solucao, "");
    assert.deepEqual(cartao.pontosFracos, ["Fraco B.", "Fraco D.", "Fraco A."]);
    assert.equal(cartao.resumo, "Fraco B.");
    assert.ok(!cartao.pontosFracos.some((t) => t.includes("Trade-offs")));
    assert.ok(!cartao.pontosFracos.includes("Não deve aparecer."));
  });

  it("scorecard novo usa os pontos a aprofundar como pontos fracos", () => {
    const cartao = cartaoDoScorecard(scorecard(), KIT_SYSTEM_DESIGN);
    assert.deepEqual(cartao.pontosFracos, ["Dimensionamento de leitura: não estimou o volume."]);
  });

  it("briefing vazio: sem próximos passos; critério sem nota aparece com o nome do kit", () => {
    const cartao = cartaoDoScorecard(
      scorecard({ briefing_para_proxima_etapa: "  ", criterios: [criterio(c1.id, null, "Sem prova.")] }),
      KIT_SYSTEM_DESIGN,
    );
    assert.deepEqual(cartao.proximosPassos, []);
    assert.deepEqual(cartao.criterios, [{ nome: c1.nome, nota: null, justificativa: "Sem prova." }]);
  });
});
