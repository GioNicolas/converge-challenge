// Instruções de condução (#127): o patch do extrator, a conversão para a config e o prompt.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aplicarPatch, montarMensagens } from "../extrator";
import { paraInterviewConfig } from "../rascunho";
import { InterviewConfig } from "@/lib/contracts";
import { sessaoAberta } from "./apoio";

const rascunhoDe = () => sessaoAberta().rascunho;

describe("conducao no rascunho", () => {
  it("o patch com conducao entra no rascunho, sem virar critério", () => {
    const antes = rascunhoDe();
    const r = aplicarPatch(antes, { conducao: ["Redirecione o candidato se errar o escopo"] });
    assert.deepEqual(r.conducao, ["Redirecione o candidato se errar o escopo"]);
    assert.deepEqual(
      r.criteria.map((c) => c.id),
      antes.criteria.map((c) => c.id),
    );
  });

  it("mescla com o que já existia, sem repetir", () => {
    const base = { ...rascunhoDe(), conducao: ["Não dê a resposta"] };
    const r = aplicarPatch(base, { conducao: ["não dê a resposta.", "Pergunte sobre testes"] });
    assert.deepEqual(r.conducao, ["Não dê a resposta", "Pergunte sobre testes"]);
  });

  it("patch sem conducao preserva a lista", () => {
    const base = { ...rascunhoDe(), conducao: ["Deixe ele pensar"] };
    assert.deepEqual(aplicarPatch(base, { durationMin: 40 }).conducao, ["Deixe ele pensar"]);
  });

  it("o prompt do extrator separa condução de critério", () => {
    const sistema = montarMensagens(rascunhoDe(), [])[0].content;
    assert.match(sistema, /conducao/);
    assert.match(sistema, /NUNCA vai em criteria/);
  });
});

describe("conducao na config", () => {
  it("vira conductNotes", () => {
    const r = paraInterviewConfig({ ...rascunhoDe(), conducao: ["Redirecione se errar o escopo"] });
    assert.ok(r.ok);
    assert.deepEqual(r.config.conductNotes, ["Redirecione se errar o escopo"]);
  });

  it("sem condução, o campo fica de fora", () => {
    const r = paraInterviewConfig(rascunhoDe());
    assert.ok(r.ok);
    assert.equal("conductNotes" in r.config, false);
  });

  it("o schema aceita config sem o campo (retrocompatível)", () => {
    const r = paraInterviewConfig(rascunhoDe());
    assert.ok(r.ok);
    const antiga: Record<string, unknown> = { ...r.config };
    delete antiga.conductNotes;
    assert.equal(InterviewConfig.safeParse(antiga).success, true);
  });
});
