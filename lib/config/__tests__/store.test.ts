import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { comQuestaoSorteada, normalizarConfig } from "../store";
import { DEFAULT_CONFIG } from "../default";
import type { InterviewConfig } from "@/lib/contracts";

const VAGA_PLENA: InterviewConfig = {
  ...DEFAULT_CONFIG,
  id: "cfg-teste",
  mode: "live_coding",
  seniority: "pleno",
  difficulty: "medio",
  focus: [{ area: "tecnico", weight: 1 }],
};

describe("questão fixada a pedido da recrutadora", () => {
  it("normalizarConfig não troca a questão pedida por causa do nível: o nível passa a ser o da questão", () => {
    const config = normalizarConfig({ ...VAGA_PLENA, problemId: "two-sum", problemaFixado: true });
    assert.equal(config.problemId, "two-sum");
    assert.equal(config.difficulty, "facil");
    assert.equal(config.problemaFixado, true);
  });

  it("comQuestaoSorteada não sorteia: toda entrevista da vaga abre com a questão pedida", () => {
    const config = normalizarConfig({ ...VAGA_PLENA, problemId: "two-sum", problemaFixado: true });
    for (let i = 0; i < 30; i++) assert.equal(comQuestaoSorteada(config).problemId, "two-sum");
  });

  it("fixada mas fora do banco: cai no padrão e deixa de ser fixada", () => {
    const config = normalizarConfig({ ...VAGA_PLENA, problemId: "Two sum", problemaFixado: true });
    assert.notEqual(config.problemId, "Two sum");
    assert.equal(config.problemaFixado, undefined);
  });

  it("sem pedido, a questão de nível errado é trocada e o sorteio varia entre candidatos", () => {
    const config = normalizarConfig({ ...VAGA_PLENA, problemId: "two-sum" });
    assert.equal(config.difficulty, "medio");
    assert.notEqual(config.problemId, "two-sum");
    const sorteadas = new Set(Array.from({ length: 60 }, () => comQuestaoSorteada(config).problemId));
    assert.ok(sorteadas.size > 1, `sorteio deveria variar, saiu sempre ${[...sorteadas]}`);
  });
});
