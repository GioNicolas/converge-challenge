// Issue #89, sala de live coding: as mesmas regras de justiça do quadro (lib/totti/relatorio.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { descartarProvaDePedido, fatoDeEncerramentoAntecipado, limparTextosDoRelatorio } from "../evaluator";
import { buildEvaluatorSystem } from "../prompts/evaluator";
import { REGRAS_DE_JUSTICA_DO_RELATORIO } from "../../totti/relatorio";
import { getProblem } from "@/problems";
import { DEFAULT_CONFIG } from "../../config/default";

const falas = (m: Record<string, string[]>) => new Map(Object.entries(m));

describe("live coding: pedido de repetição não é prova", () => {
  it("'o que você perguntou?' como única prova de comunicação não dá nota baixa", () => {
    const r = descartarProvaDePedido(
      { score: 1, evidence: [{ at: "06:27", text: "Pediu para repetir a pergunta e não acompanhou." }] },
      falas({ "06:27": ["O que você perguntou?"] }),
    );
    assert.equal(r.score, null);
    assert.equal(r.semProva, true);
    assert.deepEqual(r.evidence, []);
  });

  it("nota 2 também cai; nota 3 com outra prova fica, só sem a evidência de pedido", () => {
    const dois = descartarProvaDePedido({ score: 2, evidence: [{ at: "01:00", text: "x" }] }, falas({ "01:00": ["Não entendi."] }));
    assert.equal(dois.score, null);
    const tres = descartarProvaDePedido(
      { score: 3, evidence: [{ at: "01:00", text: "x" }, { at: "02:00", text: "Explicou o custo do loop interno." }] },
      falas({ "01:00": ["Não entendi."], "02:00": ["O loop interno custa n vezes, porque percorre o resto do array."] }),
    );
    assert.equal(tres.score, 3);
    assert.deepEqual(tres.evidence.map((e) => e.at), ["02:00"]);
  });

  it("nota 4 cuja única prova era pedido de repetição também vira nula, sem prova", () => {
    const r = descartarProvaDePedido({ score: 4, evidence: [{ at: "01:00", text: "x" }] }, falas({ "01:00": ["Pode repetir a pergunta?"] }));
    assert.equal(r.score, null);
    assert.equal(r.semProva, true);
    assert.deepEqual(r.evidence, []);
  });

  it("fala com conteúdo continua sendo prova, mesmo de nota baixa", () => {
    const r = descartarProvaDePedido(
      { score: 1, evidence: [{ at: "03:00", text: "Não soube explicar o custo." }] },
      falas({ "03:00": ["Não sei, acho que é n ao quadrado porque tem dois loops."] }),
    );
    assert.equal(r.score, 1);
    assert.equal(r.evidence.length, 1);
  });

  it("sem evidência alguma, a nota fica como o modelo deu (nada a descartar)", () => {
    const r = descartarProvaDePedido({ score: 2, evidence: [] }, falas({}));
    assert.equal(r.score, 2);
  });

  it("a evidência que cita o pedido no próprio texto também é descartada", () => {
    const r = descartarProvaDePedido({ score: 1, evidence: [{ at: "09:99", text: "Como é? O que que cê perguntou?" }] }, falas({}));
    assert.equal(r.score, null);
  });
});

describe("live coding: textos do relatório", () => {
  it("tira culpa, 'Aprofundar X.' e termo interno; deixa fatos", () => {
    const t = limparTextosDoRelatorio({
      summary: "Resolveu o problema com força bruta.",
      strengths: ["Explicou o custo do loop."],
      concerns: ["Pediu repetições sucessivas das perguntas.", "Respondeu às dicas do plin sem testar.", "Aprofundar Complexidade."],
      nextSteps: ["Aprofundar Comunicação.", "Pedir que compare com a solução em hash."],
    }, null);
    assert.deepEqual(t.concerns, ["Respondeu às dicas da pergunta sem testar."]);
    assert.deepEqual(t.nextSteps, ["Pedir que compare com a solução em hash."]);
    assert.equal(t.summary, "Resolveu o problema com força bruta.");
  });

  it("resumo que culpa o candidato é trocado pelo fato de cobertura; encerramento vira fato sem adjetivo", () => {
    const fato = fatoDeEncerramentoAntecipado(8 * 60_000 + 43_000, 30, 2, 5);
    assert.equal(fato, "A entrevista durou 8 de 30 minutos; 2 de 5 critérios ficaram sem prova.");
    const t = limparTextosDoRelatorio({ summary: "Encerrou a entrevista abruptamente.", strengths: [], concerns: [], nextSteps: [] }, fato);
    assert.equal(t.summary, fato);
    const com = limparTextosDoRelatorio({ summary: "Resolveu o exercício.", strengths: [], concerns: [], nextSteps: [] }, fato);
    assert.equal(com.summary, `Resolveu o exercício. ${fato}`);
  });

  it("sessão que foi até perto do fim não ganha fato de encerramento", () => {
    assert.equal(fatoDeEncerramentoAntecipado(28 * 60_000, 30, 0, 5), null);
    assert.equal(fatoDeEncerramentoAntecipado(27 * 60_000, 30, 2, 5), null);
    assert.equal(fatoDeEncerramentoAntecipado(60_000, 0, 2, 5), null);
  });
});

describe("live coding: prompt do avaliador", () => {
  it("traz o bloco comum de justiça e a regra de comunicação sem fala de conteúdo", () => {
    const config = DEFAULT_CONFIG;
    const problem = getProblem(config.problemId);
    const system = buildEvaluatorSystem(config, problem, config.criteria.map((c) => c.id));
    assert.ok(system.includes(REGRAS_DE_JUSTICA_DO_RELATORIO));
    assert.ok(system.includes("pedir repetição ou esclarecimento, a nota de comunicação é null"));
  });
});
