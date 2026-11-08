import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kitFalso } from "../falso";
import { dadosPublicosDoProblema } from "../index";
import type { Kit, Problema } from "../tipos";
import { MAX_FALA_DO_DESAFIO, validarKit } from "../validar";

const base = (): Kit => ({ ...kitFalso("coordenação de obras"), id: "obra_x", problemas: [{ ...kitFalso().problemas[0], id: "obra_x_p1" }] });
const comFala = (fala: string | undefined): Kit => {
  const k = base();
  k.problemas = [{ ...k.problemas[0], falaDoDesafio: fala } as Problema];
  return k;
};
const erros = (k: Kit) => {
  const r = validarKit(k);
  return r.ok ? [] : r.erros;
};

describe("falaDoDesafio no problema público", () => {
  it("sai como fala_do_desafio, aparada, e não vaza a ficha", () => {
    const k = base();
    const p = { ...k.problemas[0], falaDoDesafio: "  Hoje o tema é obras.  " };
    const pub = dadosPublicosDoProblema(p);
    assert.equal(pub.fala_do_desafio, "Hoje o tema é obras.");
    assert.ok(!JSON.stringify(pub).includes(p.ficha[0].resposta));
  });

  it("ausente ou em branco: o campo nem aparece", () => {
    const p = base().problemas[0];
    assert.equal("fala_do_desafio" in dadosPublicosDoProblema({ ...p, falaDoDesafio: undefined }), false);
    assert.equal("fala_do_desafio" in dadosPublicosDoProblema({ ...p, falaDoDesafio: "   " }), false);
  });
});

describe("validarKit com falaDoDesafio", () => {
  it("é opcional", () => {
    assert.deepEqual(erros(comFala(undefined)), []);
  });

  it("aceita uma fala normal", () => {
    assert.deepEqual(erros(comFala("Hoje o tema é a organização do canteiro. Pergunte o que quiser antes de desenhar.")), []);
  });

  it("rejeita fala maior que o limite", () => {
    const es = erros(comFala("a".repeat(MAX_FALA_DO_DESAFIO + 1)));
    assert.ok(es.some((e) => e.includes("falaDoDesafio com")), JSON.stringify(es));
  });

  it("rejeita fala que repete número da ficha", () => {
    // kitFalso: respostas oficiais com "valor 21", "valor 28"...
    const es = erros(comFala("Hoje temos valor 21 para organizar."));
    assert.ok(es.some((e) => e.includes("falaDoDesafio vaza")), JSON.stringify(es));
  });
});
