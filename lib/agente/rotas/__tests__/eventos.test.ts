import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventosDaMaquina, pecasDoDesenho } from "../handlers";

const UM = "COMPONENTES\n- [r1] Cliente (retângulo)\nCONEXÕES";
const DOIS = "COMPONENTES\n- [r1] Cliente (retângulo)\n- [r2] API (retângulo)\nCONEXÕES";
const COM_SETA = "COMPONENTES\n- [r1] Cliente (retângulo)\nCONEXÕES\n- [s1] Cliente → ? (seta solta)\nANOTAÇÕES SOLTAS\n- [t1] \"oi\"";

describe("desenho e a saída de REQUISITOS", () => {
  it("conta componentes e conexões, não anotações", () => {
    assert.equal(pecasDoDesenho(UM), 1);
    assert.equal(pecasDoDesenho(DOIS), 2);
    assert.equal(pecasDoDesenho(COM_SETA), 2);
  });
  it("um traço solto não sai de REQUISITOS; duas peças saem", () => {
    assert.deepEqual(eventosDaMaquina("desenho", { grafo: UM, mudancas: "" }), [{ tipo: "DESENHO_ATUALIZADO", grafo: UM }]);
    assert.deepEqual(eventosDaMaquina("desenho", { grafo: DOIS, mudancas: "" }), [{ tipo: "CANDIDATO_DESENHOU" }, { tipo: "DESENHO_ATUALIZADO", grafo: DOIS }]);
  });
  it("os ids alterados continuam valendo mesmo sem sair da fase", () => {
    assert.deepEqual(eventosDaMaquina("desenho", { grafo: UM, mudancas: "~ moveu [r1] Cliente" }), [
      { tipo: "ELEMENTOS_ALTERADOS", ids: ["r1"] },
      // O desenho inteiro vai junto: é por ele que a sessão sabe se o candidato voltou a desenhar depois de concluir (#84).
      { tipo: "DESENHO_ATUALIZADO", grafo: UM },
    ]);
  });
  it("sem grafo (cliente antigo) mantém o comportamento de antes", () => {
    assert.deepEqual(eventosDaMaquina("desenho", {}), [{ tipo: "CANDIDATO_DESENHOU" }]);
  });
});
