import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { camposFalados, camposMudados, reaplicarFixados, soltarCampos } from "../fixados";
import { LIMIAR } from "../cobertura";
import { aplicarPesosNaSessao, salvarRevisao } from "../sessoes";
import { sessaoAberta } from "./apoio";

describe("revisão editada: campos fixados", () => {
  it("salvar fixa só o que mudou, e a duração vale também nas preferências", () => {
    const sessao = sessaoAberta();
    const editado = { ...structuredClone(sessao.rascunho), seniority: "senior" as const, durationMin: 50 };
    const mudados = salvarRevisao(sessao, editado);
    assert.deepEqual(mudados, ["seniority", "durationMin"]);
    assert.deepEqual(sessao.rascunho.fixados, ["seniority", "durationMin"]);
    assert.equal(sessao.preferencias.duracaoMin, 50);
  });

  it("nada mudou: nada fixado", () => {
    const sessao = sessaoAberta();
    assert.deepEqual(salvarRevisao(sessao, structuredClone(sessao.rascunho)), []);
    assert.deepEqual(sessao.rascunho.fixados, []);
  });

  it("a extração simulada não sobrescreve o campo fixado, e os outros campos seguem automáticos", () => {
    const sessao = sessaoAberta();
    salvarRevisao(sessao, { ...structuredClone(sessao.rascunho), seniority: "senior", recruiterNotes: "Minha nota." });
    // O que a extração devolveria: nível e notas do automático, mais um campo novo.
    const extraido = { ...sessao.rascunho, seniority: "junior" as const, recruiterNotes: "Do extrator.", durationMin: 20 };
    const depois = reaplicarFixados(sessao.rascunho, extraido);
    assert.equal(depois.seniority, "senior");
    assert.equal(depois.recruiterNotes, "Minha nota.");
    assert.equal(depois.durationMin, 20);
    assert.deepEqual(depois.fixados, ["seniority", "recruiterNotes"]);
  });

  it("os pesos automáticos preservam o foco e os critérios editados", () => {
    const sessao = sessaoAberta();
    const r = structuredClone(sessao.rascunho);
    const criteria = r.criteria.map((c, i) => (i === 0 ? { ...c, name: "Critério dela" } : c));
    salvarRevisao(sessao, { ...r, criteria, recruiterNotes: "Notas dela." });
    aplicarPesosNaSessao(sessao, "teste");
    assert.equal(sessao.rascunho.criteria[0].name, "Critério dela");
    assert.equal(sessao.rascunho.recruiterNotes, "Notas dela.");
  });

  it("sinal de mudança daquele campo solta o fixado; outro sinal não", () => {
    const sessao = sessaoAberta();
    salvarRevisao(sessao, { ...structuredClone(sessao.rascunho), seniority: "senior", recruiterNotes: "Nota." });
    const r = sessao.rascunho;
    assert.deepEqual([...camposFalados({ quer_pressao: 0.9 }, {}, LIMIAR)], ["focus", "criteria"]);
    assert.deepEqual([...camposFalados({ quer_tom_desafiador: 0.9 }, {}, LIMIAR)], ["recruiterNotes"]);
    assert.deepEqual([...camposFalados({ pediu_mudanca: 0.9 }, {}, LIMIAR)], []);
    assert.deepEqual([...camposFalados({ quer_pressao: 0.2 }, {}, LIMIAR)], []);
    assert.deepEqual([...camposFalados({}, { nivelDito: true, duracaoDita: true }, LIMIAR)], ["seniority", "durationMin"]);
    const solto = soltarCampos(r, camposFalados({ quer_tom_amigavel: 0.9 }, {}, LIMIAR));
    assert.deepEqual(solto.fixados, ["seniority"]);
    // Solto, o automático volta a valer.
    assert.equal(reaplicarFixados(solto, { ...r, recruiterNotes: "Novo." }).recruiterNotes, "Novo.");
  });

  it("confirmar: o rascunho enviado substitui o da sessão e é válido", () => {
    const sessao = sessaoAberta();
    const mudados = camposMudados(sessao.rascunho, { ...sessao.rascunho, durationMin: 40 });
    assert.deepEqual(mudados, ["durationMin"]);
  });
});
