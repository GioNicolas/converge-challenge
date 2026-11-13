import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reaplicarFixados } from "../fixados";
import { estadoDaSessao, maisNova, rodadaPodeConfirmarInicio, salvarRevisao, sincronizarSessao, type CopiaSessao, type Sessao } from "../sessoes";
import { ela, sessaoAberta, sessaoRecemAberta, totti } from "./apoio";

/** A cópia como a tela a guardaria: JSON puro, sem referência à sessão do servidor. */
const copiaDe = (sessao: Sessao): CopiaSessao => JSON.parse(JSON.stringify(estadoDaSessao(sessao).copia)) as CopiaSessao;

describe("cópia guardada antes de `fixados` e `conducao`", () => {
  it("sincroniza com os padrões e o turno, a reaplicação e a revisão não quebram", () => {
    const sessao = sessaoAberta();
    const copia = copiaDe(sessao);
    // Uma fala a mais: a cópia é mais nova que a sessão da instância.
    copia.transcricao.push(ela("Pleno, 45 minutos."));
    const velho = copia.rascunho as unknown as Record<string, unknown>;
    delete velho.fixados;
    delete velho.conducao;
    delete velho.conducaoVista;
    delete velho.origens;

    const reconstruida = sincronizarSessao(sessao.id, copia);
    assert.ok(reconstruida);
    assert.equal(reconstruida.transcricao.length, copia.transcricao.length);
    assert.deepEqual(reconstruida.rascunho.fixados, []);
    assert.deepEqual(reconstruida.rascunho.conducao, []);
    assert.deepEqual(reconstruida.rascunho.origens, {});

    assert.doesNotThrow(() => reaplicarFixados(reconstruida.rascunho, { ...reconstruida.rascunho, seniority: "junior" }));
    assert.doesNotThrow(() => salvarRevisao(reconstruida, { ...structuredClone(reconstruida.rascunho), seniority: "senior" }));
    assert.deepEqual(reconstruida.rascunho.fixados, ["seniority"]);
  });

  it("rascunho da cópia que não passa no schema: a cópia é recusada e a sessão da instância fica", () => {
    const sessao = sessaoAberta();
    const copia = copiaDe(sessao);
    copia.transcricao.push(ela("oi"));
    (copia.rascunho as unknown as Record<string, unknown>).mode = "modo-que-nao-existe";
    const atual = sincronizarSessao(sessao.id, copia);
    assert.equal(atual, sessao);
    assert.equal(atual.transcricao.length, copia.transcricao.length - 1);
  });
});

describe("revisão salva e instância com a sessão mais velha", () => {
  it("salvarRevisao sobe o contador, mesmo só com o título mudado", () => {
    const sessao = sessaoAberta();
    assert.equal(sessao.status.versaoRevisao ?? 0, 0);
    salvarRevisao(sessao, { ...structuredClone(sessao.rascunho), roleTitle: "Outro título" });
    assert.equal(sessao.status.versaoRevisao, 1);
    salvarRevisao(sessao, { ...structuredClone(sessao.rascunho), seniority: "senior" });
    assert.equal(sessao.status.versaoRevisao, 2);
  });

  it("maisNova: mesma transcrição, revisão maior vence mesmo com extração menor", () => {
    const sessao = sessaoAberta();
    const copia = copiaDe(sessao);
    assert.equal(maisNova(copia, sessao), false);
    copia.status.versaoRevisao = 1;
    assert.equal(maisNova(copia, sessao), true);
    sessao.status.versaoExtraida = 5;
    assert.equal(maisNova(copia, sessao), true);
    // Revisão igual: volta a valer a extração.
    sessao.status.versaoRevisao = 1;
    assert.equal(maisNova(copia, sessao), false);
    copia.status.versaoExtraida = 6;
    assert.equal(maisNova(copia, sessao), true);
    // Falas a mais sempre vencem.
    sessao.status.versaoRevisao = 9;
    copia.transcricao.push(ela("oi"));
    assert.equal(maisNova(copia, sessao), true);
  });

  it("a instância velha adota a cópia da tela com a revisão (rascunho e fixados)", () => {
    const sessao = sessaoAberta();
    const velha = copiaDe(sessao); // o que outra instância guardaria: sem a edição
    salvarRevisao(sessao, { ...structuredClone(sessao.rascunho), seniority: "senior", recruiterNotes: "Nota dela." });
    const comEdicao = copiaDe(sessao);
    assert.equal(comEdicao.status.versaoRevisao, 1);

    // Esta instância volta a ter só a sessão velha (sem a revisão) e recebe a cópia com a edição.
    sessao.rascunho = velha.rascunho;
    sessao.status.versaoRevisao = 0;
    const b = sincronizarSessao(sessao.id, comEdicao);
    assert.ok(b);
    assert.equal(b.rascunho.seniority, "senior");
    assert.equal(b.rascunho.recruiterNotes, "Nota dela.");
    assert.deepEqual(b.rascunho.fixados, ["seniority", "recruiterNotes"]);
    assert.equal(b.status.versaoRevisao, 1);
  });
});

describe("revisão com base: só o que ela mudou, sobre o rascunho atual", () => {
  it("não desfaz o que a extração trouxe depois de a tela ter copiado o rascunho", () => {
    const sessao = sessaoAberta();
    const base = structuredClone(sessao.rascunho);
    // Enquanto ela editava, a extração mudou o nível, os eliminatórios e o contexto.
    sessao.rascunho = { ...sessao.rascunho, seniority: "junior", eliminatorios: ["sem teste"], contexto: "time pequeno" };
    const editado = { ...structuredClone(base), recruiterNotes: "Nota dela.", durationMin: 50 };
    const mudados = salvarRevisao(sessao, editado, base);
    assert.deepEqual(mudados, ["recruiterNotes", "durationMin"]);
    assert.equal(sessao.rascunho.seniority, "junior");
    assert.deepEqual(sessao.rascunho.eliminatorios, ["sem teste"]);
    assert.equal(sessao.rascunho.contexto, "time pequeno");
    assert.equal(sessao.rascunho.recruiterNotes, "Nota dela.");
    assert.equal(sessao.rascunho.durationMin, 50);
    assert.deepEqual(sessao.rascunho.fixados, ["recruiterNotes", "durationMin"]);
    assert.equal(sessao.preferencias.duracaoMin, 50);
  });

  it("o título mudado vale sem fixar nada; sem base, o comportamento é o de antes", () => {
    const sessao = sessaoAberta();
    const base = structuredClone(sessao.rascunho);
    const mudados = salvarRevisao(sessao, { ...structuredClone(base), roleTitle: "Novo título" }, base);
    assert.deepEqual(mudados, []);
    assert.equal(sessao.rascunho.roleTitle, "Novo título");
    assert.deepEqual(sessao.rascunho.fixados, []);

    const sem = sessaoAberta();
    salvarRevisao(sem, { ...structuredClone(sem.rascunho), seniority: "senior" });
    assert.equal(sem.rascunho.seniority, "senior");
    assert.deepEqual(sem.rascunho.fixados, ["seniority"]);
  });

  it("linha de condução apagada na revisão não volta com a extração; linha nova entra; conducaoVista não vem da tela", () => {
    const sessao = sessaoAberta();
    sessao.rascunho = { ...sessao.rascunho, conducao: ["Redirecione o candidato.", "Não dê dicas."] };
    const base = structuredClone(sessao.rascunho);
    // Ela apaga a primeira linha; a tela ainda tenta mandar um `conducaoVista` próprio.
    const editado = { ...structuredClone(base), conducao: ["Não dê dicas."], conducaoVista: ["Inventada pela tela."] };
    const mudados = salvarRevisao(sessao, editado, base);
    assert.ok(mudados.includes("conducao"));
    assert.deepEqual(sessao.rascunho.conducao, ["Não dê dicas."]);
    assert.ok(!sessao.rascunho.conducaoVista.includes("Inventada pela tela."));

    // A próxima extração traz a linha apagada de novo e uma instrução nova.
    const extraido = { ...sessao.rascunho, conducao: ["Redirecione o candidato.", "Não dê dicas.", "Peça para pensar em voz alta."] };
    const depois = reaplicarFixados(sessao.rascunho, extraido);
    assert.deepEqual(depois.conducao, ["Não dê dicas.", "Peça para pensar em voz alta."]);
  });
});

describe("rodada de segundo plano e o início", () => {
  it("sem proposta feita, ou lendo só até a proposta, não confirma o início", () => {
    const recem = sessaoRecemAberta([ela("Quero um pleno.")]);
    assert.equal(rodadaPodeConfirmarInicio(recem, recem.transcricao), false);

    const aberta = sessaoAberta([ela("Quero um pleno."), totti("Proponho live coding, pleno. Pode ser?")]);
    assert.equal(rodadaPodeConfirmarInicio(aberta, aberta.transcricao), false);

    aberta.transcricao.push(ela("Pode ser."));
    assert.equal(rodadaPodeConfirmarInicio(aberta, aberta.transcricao), true);
  });
});
