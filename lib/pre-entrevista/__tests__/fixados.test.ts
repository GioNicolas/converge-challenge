import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Rascunho } from "../rascunho";
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
    assert.deepEqual([...camposFalados({ quer_pressao: 0.9 }, {}, LIMIAR)], ["focus", "criteria", "recruiterNotes"]);
    assert.deepEqual([...camposFalados({ quer_tom_desafiador: 0.9 }, {}, LIMIAR)], ["recruiterNotes"]);
    assert.deepEqual([...camposFalados({ pediu_mudanca: 0.9 }, {}, LIMIAR)], ["criteria", "recruiterNotes"]);
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

describe("revisão editada: formato, notas e condução", () => {
  it("aceitar a troca de formato solta o modo, o foco, os critérios e as notas", () => {
    const soltos = camposFalados({ escolheu_trocar_formato: 0.9 }, {}, LIMIAR);
    assert.deepEqual([...soltos].sort(), ["criteria", "focus", "mode", "recruiterNotes"]);
    // Escolher outra etapa ou seguir sem não muda o modo.
    assert.equal(camposFalados({ escolheu_proxima_etapa: 0.9 }, {}, LIMIAR).has("mode"), false);
  });

  it("soltar foco, modo ou critérios solta as notas geradas; tom e nível não mexem no foco", () => {
    for (const s of ["quer_pressao", "pediu_equilibrio", "pediu_live_coding", "pediu_mudanca"]) {
      assert.equal(camposFalados({ [s]: 0.9 }, {}, LIMIAR).has("recruiterNotes"), true, s);
    }
    assert.deepEqual([...camposFalados({}, { nivelDito: true }, LIMIAR)], ["seniority"]);
  });

  it("critério editado e depois mudado na fala ('pediu_mudanca') deixa de ser restaurado", () => {
    const sessao = sessaoAberta();
    const r = structuredClone(sessao.rascunho);
    const criteria = r.criteria.map((c, i) => (i === 0 ? { ...c, name: "Critério dela" } : c));
    salvarRevisao(sessao, { ...r, criteria, recruiterNotes: "Nota dela." });
    const solto = soltarCampos(sessao.rascunho, camposFalados({ pediu_mudanca: 0.9 }, {}, LIMIAR));
    assert.deepEqual(solto.fixados, []);
    const sem = { ...sessao.rascunho, criteria: sessao.rascunho.criteria.slice(1), recruiterNotes: "Gerada." };
    const depois = reaplicarFixados(solto, sem);
    assert.equal(depois.criteria.length, sem.criteria.length);
    assert.equal(depois.recruiterNotes, "Gerada.");
  });
});

describe("revisão editada: condução", () => {
  const comConducao = () => {
    const sessao = sessaoAberta();
    // O automático já produziu duas instruções (passa por reaplicarFixados, que as registra).
    sessao.rascunho = reaplicarFixados(sessao.rascunho, { ...sessao.rascunho, conducao: ["Não dê a resposta", "Deixe ele pensar"] });
    return sessao;
  };

  it("editar só a condução fixa só a condução", () => {
    const sessao = comConducao();
    const mudados = salvarRevisao(sessao, { ...structuredClone(sessao.rascunho), conducao: ["Não dê a resposta"] });
    assert.deepEqual(mudados, ["conducao"]);
    assert.deepEqual(sessao.rascunho.fixados, ["conducao"]);
  });

  it("linha apagada ou reescrita não volta; instrução nova ainda entra", () => {
    const sessao = comConducao();
    salvarRevisao(sessao, { ...structuredClone(sessao.rascunho), conducao: ["Não dê a resposta nem pistas"] });
    // O extrator relê a conversa inteira: traz as duas originais e uma instrução nova.
    const extraido = { ...sessao.rascunho, conducao: ["Não dê a resposta", "Deixe ele pensar", "Pergunte sobre testes"] };
    const depois = reaplicarFixados(sessao.rascunho, extraido);
    assert.deepEqual(depois.conducao, ["Não dê a resposta nem pistas", "Pergunte sobre testes"]);
    // Na leitura seguinte a nova já faz parte da lista dela, sem duplicar.
    const outra = reaplicarFixados(depois, { ...depois, conducao: ["Não dê a resposta", "Pergunte sobre testes", "Deixe ele pensar"] });
    assert.deepEqual(outra.conducao, ["Não dê a resposta nem pistas", "Pergunte sobre testes"]);
  });

  it("apagar tudo também vale", () => {
    const sessao = comConducao();
    salvarRevisao(sessao, { ...structuredClone(sessao.rascunho), conducao: [] });
    const depois = reaplicarFixados(sessao.rascunho, { ...sessao.rascunho, conducao: ["Deixe ele pensar"] });
    assert.deepEqual(depois.conducao, []);
  });

  it("Rascunho antigo, sem fixados nem conducao, é aceito com padrões vazios", () => {
    const antigo: Record<string, unknown> = { ...sessaoAberta().rascunho };
    delete antigo.fixados;
    delete antigo.conducao;
    delete antigo.conducaoVista;
    const r = Rascunho.parse(antigo);
    assert.deepEqual(r.fixados, []);
    assert.deepEqual(r.conducao, []);
    assert.deepEqual(r.conducaoVista, []);
  });
});
