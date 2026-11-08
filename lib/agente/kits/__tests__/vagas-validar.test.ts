import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kitFalso } from "../falso";
import type { Kit } from "../tipos";
import { paraSlug, validarKit } from "../validar";

const base = (): Kit => ({ ...kitFalso("coordenação de obras"), id: "obra_x", problemas: [{ ...kitFalso().problemas[0], id: "obra_x_p1" }] });
const clone = <T,>(x: T): T => structuredClone(x);

function erros(k: unknown): string[] {
  const r = validarKit(k);
  assert.equal(r.ok, false, "deveria ser inválido");
  return r.ok ? [] : r.erros;
}
const tem = (es: string[], trecho: string) => assert.ok(es.some((e) => e.includes(trecho)), `esperava "${trecho}" em ${JSON.stringify(es)}`);

describe("validarKit", () => {
  it("aceita um kit bom", () => {
    const r = validarKit(base());
    assert.equal(r.ok, true);
  });

  it("rejeita fora do schema", () => {
    tem(erros({ id: "x" }), "schema:");
  });

  it("menos de 6 critérios", () => {
    const k = base();
    k.criterios = k.criterios.slice(0, 5);
    tem(erros(k), "mínimo é 6");
  });

  it("ids de critério duplicados e inseguros", () => {
    const k = base();
    k.criterios[1].id = k.criterios[0].id;
    k.criterios[2].id = "Id Ruim!";
    const e = erros(k);
    tem(e, "id duplicado");
    tem(e, "não é slug seguro");
  });

  it("nível vazio e níveis repetidos", () => {
    const k = base();
    k.criterios[0].niveis[2] = "   ";
    k.criterios[1].niveis[3] = k.criterios[1].niveis[4];
    const e = erros(k);
    tem(e, "nível 2 vazio");
    tem(e, "precisam ser distintos");
  });

  it("ficha com menos de 8 linhas", () => {
    const k = base();
    k.problemas[0].ficha = k.problemas[0].ficha.slice(0, 7);
    tem(erros(k), "mínimo é 8");
  });

  it("sinais, armadilhas, perguntas e tipos de pergunta mínimos", () => {
    const k = base();
    k.problemas[0].sinaisEsperados = ["a", "b", "c"];
    k.problemas[0].armadilhas = ["a", "b"];
    k.problemas[0].perguntasSugeridas = ["a", "b"];
    k.tiposPergunta = k.tiposPergunta.slice(0, 3);
    const e = erros(k);
    tem(e, "sinaisEsperados");
    tem(e, "armadilhas");
    tem(e, "perguntasSugeridas");
    tem(e, "tiposPergunta");
  });

  it("enunciado acima de 500 caracteres", () => {
    const k = base();
    k.problemas[0].enunciado = "x".repeat(501);
    tem(erros(k), "máximo é 500");
  });

  it("enunciado que vaza números da ficha", () => {
    const k = base();
    k.problemas[0].ficha[0].resposta = "Prazo de 18 meses e 1.200 m2 por pavimento";
    k.problemas[0].enunciado = "Planeje uma obra de 18 meses.";
    tem(erros(k), "vaza números da ficha (18)");
    k.problemas[0].enunciado = "Planeje o prédio com 1200 m2 por andar.";
    tem(erros(k), "vaza números da ficha (1200)");
    k.problemas[0].enunciado = "Planeje o prédio, sem números.";
    assert.equal(validarKit(k).ok, true);
  });

  it("id do kit e do problema precisam ser slugs seguros", () => {
    const k = base();
    k.id = "../etc";
    k.problemas[0].id = "__proto__";
    const e = erros(k);
    tem(e, "kit.id");
    tem(e, "problema.id");
  });

  it("exige exatamente 1 problema", () => {
    const k = base();
    k.problemas = [k.problemas[0], { ...k.problemas[0], id: "outro_p" }];
    tem(erros(k), "exatamente 1 problema");
  });

  it("textos vazios na ficha", () => {
    const k = base();
    k.problemas[0].ficha[3].resposta = "";
    tem(erros(clone(k)), "ficha[3]");
  });
});

describe("paraSlug", () => {
  it("gera slugs seguros", () => {
    assert.equal(paraSlug("backend-pleno"), "backend_pleno");
    assert.equal(paraSlug("Coordenação de Obras!"), "coordenacao_de_obras");
    assert.match(paraSlug("123"), /^[a-z][a-z0-9_]+$/);
    assert.match(paraSlug("___"), /^[a-z][a-z0-9_]+$/);
    assert.notEqual(paraSlug("__proto__"), "__proto__");
  });
});
