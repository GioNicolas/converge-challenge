import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kitFalso } from "../falso";
import type { Kit } from "../tipos";
import { empecilhoGerado, errosDoEmpecilho, idEmpecilhoDoProblema, paraSlug, validarKit } from "../validar";

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
    k.problemas[0].enunciado = "Planeje o desafio do prédio, sem números.";
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

describe("mudança no problema gerada (empecilho)", () => {
  const boa = () => ({
    tipo: "requisito_muda",
    fala: "Uma mudança no problema: o volume dobrou. Onde isso pega primeiro?",
    requisito: "Mudança: volume 2x",
    exige: "Rever a escrita e o cache.",
  });

  it("uma mudança boa passa, sem erro", () => {
    assert.deepEqual(errosDoEmpecilho(boa()), []);
  });

  it("tipo fora do enum, fala vazia, fala sem pergunta, fala longa, requisito vazio ou longo e exige vazio são erros", () => {
    assert.match(errosDoEmpecilho({ ...boa(), tipo: "inventado" }).join(" "), /tipo/);
    assert.match(errosDoEmpecilho({ ...boa(), fala: "   " }).join(" "), /fala vazia/);
    assert.match(errosDoEmpecilho({ ...boa(), fala: "O volume dobrou." }).join(" "), /pergunta/);
    assert.match(errosDoEmpecilho({ ...boa(), fala: `${"a".repeat(300)}?` }).join(" "), /301 caracteres/);
    assert.match(errosDoEmpecilho({ ...boa(), requisito: " " }).join(" "), /requisito vazio/);
    assert.match(errosDoEmpecilho({ ...boa(), requisito: "x".repeat(51) }).join(" "), /50/);
    assert.match(errosDoEmpecilho({ ...boa(), exige: "" }).join(" "), /exige vazio/);
  });

  it("requisito de exatamente 50 caracteres passa", () => {
    assert.deepEqual(errosDoEmpecilho({ ...boa(), requisito: "x".repeat(50) }), []);
  });

  it("empecilhoGerado devolve a mudança com o id dado pelo código, aparada; inválida vira undefined", () => {
    const id = idEmpecilhoDoProblema("entregas_x");
    assert.equal(id, "mudanca_entregas_x");
    assert.deepEqual(empecilhoGerado({ ...boa(), requisito: "  Mudança: volume 2x  " }, id), {
      id,
      tipo: "requisito_muda",
      fala: boa().fala,
      requisito: "Mudança: volume 2x",
      exige: "Rever a escrita e o cache.",
    });
    assert.equal(empecilhoGerado({ ...boa(), fala: "Sem pergunta." }, id), undefined);
    assert.equal(empecilhoGerado(undefined, id), undefined);
  });

  it("validarKit devolve a mudança do problema (o Zod a descartaria) e avisa quando ela não passa", () => {
    const kit = base();
    const com = clone(kit);
    com.problemas[0] = { ...com.problemas[0], empecilho: { id: "mudanca_x", ...boa() } } as never;
    const r = validarKit(com);
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.kit.problemas[0].empecilho, { id: "mudanca_x", ...boa() });

    const ruim = clone(kit);
    ruim.problemas[0] = { ...ruim.problemas[0], empecilho: { ...boa(), fala: "Sem pergunta." } } as never;
    const r2 = validarKit(ruim);
    assert.equal(r2.ok, true);
    assert.equal(r2.ok && r2.kit.problemas[0].empecilho, undefined);
    assert.equal(r2.ok && r2.avisos.some((a) => /empecilho/.test(a)), true);
  });
});
