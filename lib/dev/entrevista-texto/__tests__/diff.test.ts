import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffGrafo } from "../diff";
import { GRAFO_BOM, GRAFO_RUIM, GRAFO_VAZIO } from "../exemplos";

describe("diffGrafo", () => {
  it("adicionou: itens novos viram '+ adicionou' e entram em ids", () => {
    const d = diffGrafo(GRAFO_VAZIO, GRAFO_RUIM);
    assert.match(d.texto, /^\+ adicionou \[r1\] Cliente \(retângulo\)$/m);
    assert.match(d.texto, /^\+ adicionou \[s2\] API → Postgres/m);
    assert.deepEqual(d.ids.slice(0, 3), ["r1", "r2", "e1"]);
  });

  it("removeu: itens que sumiram viram '- removeu'", () => {
    const d = diffGrafo(GRAFO_RUIM, GRAFO_VAZIO);
    assert.match(d.texto, /^- removeu \[e1\] Postgres \(elipse\)$/m);
    assert.ok(d.ids.includes("e1"));
  });

  it("alterou: mesmo id com texto diferente vira '~ alterou'", () => {
    const antes = "COMPONENTES\n- [r1] API (retângulo)";
    const depois = "COMPONENTES\n- [r1] API v2 (retângulo)";
    const d = diffGrafo(antes, depois);
    assert.equal(d.texto, "~ alterou [r1]: API (retângulo) passou a API v2 (retângulo)");
    assert.deepEqual(d.ids, ["r1"]);
  });

  it("sem mudanças: texto vazio; cabeçalhos e ORDEM NA TELA são ignorados", () => {
    assert.deepEqual(diffGrafo(GRAFO_BOM, GRAFO_BOM), { texto: "", ids: [] });
    const a = "COMPONENTES\n- [r1] A\nORDEM NA TELA\n- A";
    const b = "COMPONENTES\n- [r1] A\nORDEM NA TELA\n- A, B";
    assert.equal(diffGrafo(a, b).texto, "");
  });

  it("aceita fim de linha CRLF", () => {
    assert.equal(diffGrafo("- [r1] A", "- [r1] A\r\n- [r2] B").texto, "+ adicionou [r2] B");
  });
});
