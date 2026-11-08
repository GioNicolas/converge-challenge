import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { faixaDaNota, NOME_RECOMENDACAO_DO_RESULTADO, ordenarPorNota, type RecomendacaoDoResultado } from "../cartao";

const item = (id: string, nota: number | undefined, startedAt = 1000, recommendation?: RecomendacaoDoResultado) => ({
  id,
  overallScore: nota,
  startedAt,
  recommendation,
});

describe("ordenarPorNota", () => {
  it("nota decrescente", () => {
    const r = ordenarPorNota([item("a", 2.5), item("b", 3.8), item("c", 3.1)]);
    assert.deepEqual(r.map((x) => x.id), ["b", "c", "a"]);
  });

  it("sem nota vai para o fim, do mais recente ao mais antigo", () => {
    const r = ordenarPorNota([item("sem-velho", undefined, 1), item("a", 1.5), item("sem-novo", undefined, 9), item("b", 4)]);
    assert.deepEqual(r.map((x) => x.id), ["b", "a", "sem-novo", "sem-velho"]);
  });

  it("empate: a melhor recomendação primeiro, depois o mais recente", () => {
    const r = ordenarPorNota([
      item("talvez", 3, 5, "talvez"),
      item("avancar-velho", 3, 1, "avancar"),
      item("avancar-novo", 3, 9, "avancar"),
      item("nao", 3, 99, "nao_avancar"),
    ]);
    assert.deepEqual(r.map((x) => x.id), ["avancar-novo", "avancar-velho", "talvez", "nao"]);
  });

  it("não altera a lista recebida e aceita lista vazia", () => {
    const entrada = [item("a", 1), item("b", 4)];
    ordenarPorNota(entrada);
    assert.deepEqual(entrada.map((x) => x.id), ["a", "b"]);
    assert.deepEqual(ordenarPorNota([]), []);
  });
});

describe("faixaDaNota", () => {
  it("separa fraca, razoável, boa e forte; sem nota é 'sem'", () => {
    assert.equal(faixaDaNota(null), "sem");
    assert.equal(faixaDaNota(undefined), "sem");
    assert.equal(faixaDaNota(1), "fraca");
    assert.equal(faixaDaNota(1.99), "fraca");
    assert.equal(faixaDaNota(2), "razoavel");
    assert.equal(faixaDaNota(2.75), "boa");
    assert.equal(faixaDaNota(3.5), "forte");
    assert.equal(faixaDaNota(4), "forte");
  });
});

describe("nomes das recomendações", () => {
  it("tem um nome para cada valor", () => {
    for (const k of ["avancar", "avancar_com_ressalvas", "talvez", "nao_avancar", "evidencia_insuficiente"] as const) {
      assert.ok(NOME_RECOMENDACAO_DO_RESULTADO[k].length > 0);
    }
  });
});
