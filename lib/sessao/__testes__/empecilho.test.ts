import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contarComponentes, esperaDoEmpecilho, esperaDoEmpecilhoForcado, type SituacaoEmpecilho } from "../empecilho";

const base: SituacaoEmpecilho = {
  agora: 1_000_000,
  fase: "ALTO_NIVEL",
  faseIniciadaEm: 1_000_000 - 300_000,
  duracaoDaFaseS: 600,
  jaAnunciado: false,
  respondendoPergunta: false,
  componentes: 4,
  ultimaFalaDoAgenteEm: null,
};

describe("hora do empecilho no quadro", () => {
  it("meio da visão geral, com desenho e em silêncio: pode", () => {
    assert.equal(esperaDoEmpecilho(base), null);
  });

  it("espera o começo da fase, o desenho, o respiro e a resposta do candidato", () => {
    assert.equal(esperaDoEmpecilho({ ...base, faseIniciadaEm: base.agora - 60_000 }), "cedo");
    assert.equal(esperaDoEmpecilho({ ...base, componentes: 2 }), "pouco desenho para adaptar");
    assert.equal(esperaDoEmpecilho({ ...base, ultimaFalaDoAgenteEm: base.agora - 5_000 }), "respiro depois da última fala");
    assert.equal(esperaDoEmpecilho({ ...base, respondendoPergunta: true }), "candidato respondendo uma pergunta");
    assert.equal(esperaDoEmpecilho({ ...base, jaAnunciado: true }), "já anunciado");
  });

  it("nem no começo nem no fim da entrevista", () => {
    for (const fase of ["APRESENTACAO", "REQUISITOS", "FECHAMENTO", "ENCERRADA"]) {
      assert.equal(esperaDoEmpecilho({ ...base, fase }), "fora do meio da entrevista");
    }
  });

  it("no aprofundamento, só com tempo para adaptar", () => {
    const aprof = { ...base, fase: "APROFUNDAMENTO", duracaoDaFaseS: 900 };
    assert.equal(esperaDoEmpecilho({ ...aprof, faseIniciadaEm: base.agora - 200_000 }), null);
    assert.equal(esperaDoEmpecilho({ ...aprof, faseIniciadaEm: base.agora - 700_000 }), "pouco tempo para adaptar");
  });

  it("forçado ignora a hora, mas não repete nem sai fora da entrevista", () => {
    assert.equal(esperaDoEmpecilhoForcado({ fase: "REQUISITOS", jaAnunciado: false }), null);
    assert.equal(esperaDoEmpecilhoForcado({ fase: "ALTO_NIVEL", jaAnunciado: true }), "já anunciado");
    assert.equal(esperaDoEmpecilhoForcado({ fase: "APRESENTACAO", jaAnunciado: false }), "entrevista fora de andamento");
  });

  it("conta as peças do desenho, sem setas nem molduras", () => {
    assert.equal(contarComponentes("COMPONENTES\n- [r1] A (retângulo)\n- [e1] B (elipse)\n- [t1] nota\nCONEXÕES\n- [s1] A → B\nSEÇÕES\n- [m1] Grupo"), 3);
    assert.equal(contarComponentes(""), 0);
  });
});
