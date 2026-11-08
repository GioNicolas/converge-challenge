import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trocarIdsPorNomes } from "../guardas";

describe("trocarIdsPorNomes", () => {
  const grafo = "COMPONENTES\n- [r5] Cache Redis (retângulo)\n- [e2] Réplica de leitura (elipse)\nCONEXÕES\n- [s5] Cache Redis → Réplica de leitura \"miss\"";
  it("troca ids entre colchetes e soltos pelo nome do elemento", () => {
    assert.equal(
      trocarIdsPorNomes("O que acontece se a chave não estiver no [r5] e a e2 receber muitas requisições?", grafo),
      "O que acontece se a chave não estiver no Cache Redis e a Réplica de leitura receber muitas requisições?",
    );
  });
  it("id desconhecido entre colchetes vira 'esse elemento'; texto sem id não muda", () => {
    assert.equal(trocarIdsPorNomes("E no [r9]?", grafo), "E no esse elemento?");
    assert.equal(trocarIdsPorNomes("Por que esse cache?", grafo), "Por que esse cache?");
  });
});
