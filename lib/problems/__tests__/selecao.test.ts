import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alternativasDoNivel, resolverProblemaPedido, titulosDoBanco } from "../selecao";
import { problemList } from "@/lib/problems";

describe("resolverProblemaPedido: o nome que ela falou vira o id do banco", () => {
  it("casa id, título e apelidos, sem acento e sem caixa", () => {
    for (const [texto, id] of [
      ["Two sum", "two-sum"],
      ["two-sum", "two-sum"],
      ["TWO SUM", "two-sum"],
      ["soma de dois", "two-sum"],
      ["Parênteses válidos", "valid-parentheses"],
      ["parenteses validos", "valid-parentheses"],
      ["valid parentheses", "valid-parentheses"],
      ["busca binária", "binary-search"],
      ["Binary Search", "binary-search"],
      ["top k frequent", "top-k-frequent"],
      ["quero que use o two sum na entrevista", "two-sum"],
    ] as const) {
      assert.equal(resolverProblemaPedido(texto)?.id, id, texto);
    }
  });

  it("vence o nome mais específico: 'busca em array rotacionado' não é busca binária", () => {
    assert.equal(resolverProblemaPedido("busca em array rotacionado")?.id, "search-rotated");
  });

  it("nome que não existe no banco não vira questão", () => {
    assert.equal(resolverProblemaPedido("N rainhas"), undefined);
    assert.equal(resolverProblemaPedido(""), undefined);
    assert.equal(resolverProblemaPedido(undefined), undefined);
  });

  it("todo título do banco se resolve para a própria questão", () => {
    for (const p of problemList) assert.equal(resolverProblemaPedido(p.title)?.id, p.id, p.title);
  });
});

describe("titulosDoBanco e alternativasDoNivel", () => {
  it("lista cada questão do banco com id e título", () => {
    assert.equal(titulosDoBanco().length, problemList.length);
    assert.ok(titulosDoBanco().includes("two-sum: Two Sum"));
  });

  it("oferece questões do nível da vaga, as que mais servem ao foco primeiro", () => {
    const opcoes = alternativasDoNivel({ seniority: "pleno", focus: [{ area: "escala_produto", weight: 1 }] });
    assert.equal(opcoes.length, 3);
    assert.ok(opcoes.every((p) => p.difficulty === "medio"));
  });
});
