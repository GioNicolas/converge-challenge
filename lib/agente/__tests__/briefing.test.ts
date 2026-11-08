import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blocoDoBriefing,
  evidenciaSuficiente,
  pesoDoCriterio,
  resumoDaCobertura,
  ritmoDaCobertura,
} from "../briefing";
import { KIT_SYSTEM_DESIGN as kit } from "../kits/system-design";
import { estadoInicial, type EstadoSessao, type ObservacaoRegistrada } from "../sessao/estado";
import type { PlanoDaSessao } from "../plano";

const MIN = 60_000;
const INICIO = 1_000_000;

function plano(foco: PlanoDaSessao["foco"] = []): PlanoDaSessao {
  return {
    cargo: "Staff Engineer",
    senioridade: "senior",
    tom: "amigavel",
    dicas: "livres",
    foco,
    notas: "",
    duracaoMin: 40,
  };
}

function obs(criterio: string, sinal: ObservacaoRegistrada["sinal"], evidencia: string, espontaneo = false): ObservacaoRegistrada {
  return { criterio, sinal, espontaneo, evidencia, em: INICIO, fase: "APROFUNDAMENTO" };
}

/** Estado com observações já aplicadas à cobertura, como `registrarObservacoes` faz. */
function comObservacoes(observacoes: ObservacaoRegistrada[], p: PlanoDaSessao | null = plano()): EstadoSessao {
  const base = estadoInicial({ criterios: kit.criterios.map((c) => c.id), plano: p });
  const cobertura = { ...base.cobertura };
  for (const o of observacoes) cobertura[o.criterio] = { ...cobertura[o.criterio], [o.sinal]: cobertura[o.criterio][o.sinal] + 1 };
  return { ...base, fase: "APROFUNDAMENTO", iniciadaEm: INICIO, observacoes, cobertura };
}

describe("evidenciaSuficiente", () => {
  it("uma observação neutra sozinha não basta", () => {
    assert.equal(evidenciaSuficiente({ positivo: 0, negativo: 0, neutro: 1 }), false);
  });
  it("uma observação com sinal claro basta, positiva ou negativa", () => {
    assert.equal(evidenciaSuficiente({ positivo: 1, negativo: 0, neutro: 0 }), true);
    assert.equal(evidenciaSuficiente({ positivo: 0, negativo: 1, neutro: 0 }), true);
  });
  it("duas neutras bastam", () => {
    assert.equal(evidenciaSuficiente({ positivo: 0, negativo: 0, neutro: 2 }), true);
  });
  it("sem registro não é suficiente", () => {
    assert.equal(evidenciaSuficiente(undefined), false);
    assert.equal(evidenciaSuficiente({ positivo: 0, negativo: 0, neutro: 0 }), false);
  });
});

describe("pesoDoCriterio", () => {
  it("critério universal vale 1", () => {
    assert.equal(pesoDoCriterio("requisitos", { plano: plano([{ area: "escala_produto", peso: 1 }]) }), 1);
  });
  it("critério ligado a uma área do foco soma o peso dela", () => {
    assert.equal(pesoDoCriterio("escalabilidade", { plano: plano([{ area: "escala_produto", peso: 0.7 }]) }), 1.7);
    assert.equal(pesoDoCriterio("dados_consistencia", { plano: plano([{ area: "tecnico", peso: 0.3 }]) }), 1.3);
  });
  it("sem plano ou sem a área no foco vale 1", () => {
    assert.equal(pesoDoCriterio("escalabilidade", { plano: null }), 1);
    assert.equal(pesoDoCriterio("escalabilidade", { plano: plano([]) }), 1);
  });
});

describe("ritmoDaCobertura", () => {
  it("não julga nos primeiros minutos", () => {
    assert.equal(ritmoDaCobertura(0, 0.1), "no_inicio");
  });
  it("atrasado quando a cobertura fica abaixo do esperado para o tempo gasto", () => {
    assert.equal(ritmoDaCobertura(0.2, 0.7), "atrasado");
  });
  it("no ritmo quando a cobertura acompanha o tempo", () => {
    assert.equal(ritmoDaCobertura(0.5, 0.5), "no_ritmo");
  });
  it("adiantado quando a cobertura passa do esperado", () => {
    assert.equal(ritmoDaCobertura(0.9, 0.4), "adiantado");
  });
  it("com 85% do tempo gasto o esperado é a cobertura completa", () => {
    assert.equal(ritmoDaCobertura(1, 0.85), "no_ritmo");
    assert.equal(ritmoDaCobertura(0.6, 0.85), "atrasado");
  });
});

describe("resumoDaCobertura", () => {
  it("sem observações a cobertura é zero e nenhum critério é suficiente", () => {
    const r = resumoDaCobertura(kit.criterios, comObservacoes([]), INICIO + 20 * MIN);
    assert.equal(r.coberturaPonderada, 0);
    assert.ok(r.criterios.every((c) => !c.suficiente));
    assert.equal(r.tempoGasto, 0.5);
    assert.equal(r.ritmo, "atrasado");
  });

  it("pondera a cobertura pelo peso do foco da recrutadora", () => {
    const estado = comObservacoes([obs("escalabilidade", "positivo", "cache de leitura")], plano([{ area: "escala_produto", peso: 1 }]));
    const r = resumoDaCobertura(kit.criterios, estado, INICIO + 20 * MIN);
    const total = r.criterios.reduce((s, c) => s + c.peso, 0);
    assert.equal(r.coberturaPonderada, 2 / total);
    assert.ok(r.coberturaPonderada > 1 / kit.criterios.length);
  });

  it("guarda só as evidências mais recentes de cada critério", () => {
    const muitas = ["a", "b", "c", "d", "e"].map((t) => obs("requisitos", "positivo", `evidência ${t}`));
    const r = resumoDaCobertura(kit.criterios, comObservacoes(muitas), INICIO + 10 * MIN);
    const requisitos = r.criterios.find((c) => c.id === "requisitos")!;
    assert.equal(requisitos.evidencias.length, 3);
    assert.equal(requisitos.evidencias.at(-1)?.evidencia, "evidência e");
  });
});

describe("blocoDoBriefing", () => {
  it("lista o que já temos, com a evidência, e o que falta", () => {
    const estado = comObservacoes([obs("escalabilidade", "positivo", "cache de leitura para o pico", true)]);
    const bloco = blocoDoBriefing(kit, estado, INICIO + 20 * MIN);
    assert.match(bloco, /BRIEFING DA ENTREVISTA/);
    assert.match(bloco, /1 de \d+ critérios com evidência suficiente/);
    assert.match(bloco, /Escalabilidade:\n {2}· positivo, espontâneo: cache de leitura para o pico/);
    assert.match(bloco, /O que ainda falta[^\n]*\n- /);
    assert.match(bloco, /Próximo alvo/);
  });

  it("o critério que mais pesa vem primeiro no que falta, com o peso", () => {
    const estado = comObservacoes([], plano([{ area: "escala_produto", peso: 0.8 }]));
    const bloco = blocoDoBriefing(kit, estado, INICIO + 10 * MIN);
    const falta = bloco.split("O que ainda falta")[1];
    assert.ok(falta.indexOf("Escalabilidade") < falta.indexOf("Trade-offs"));
    assert.match(falta, /Escalabilidade \(peso 1,8: a recrutadora quer ver\)/);
    assert.match(bloco, /Próximo alvo, se houver gancho no desenho: Escalabilidade/);
  });

  it("uma observação neutra aparece como ainda sem prova", () => {
    const estado = comObservacoes([obs("tradeoffs", "neutro", "citou custo de passagem")]);
    const bloco = blocoDoBriefing(kit, estado, INICIO + 10 * MIN);
    assert.match(bloco, /Trade-offs: só 1 observação neutra, ainda sem prova/);
  });

  it("com tudo coberto não manda perguntar mais nada novo", () => {
    const todas = kit.criterios.map((c) => obs(c.id, "positivo", `ok ${c.id}`));
    const bloco = blocoDoBriefing(kit, comObservacoes(todas), INICIO + 30 * MIN);
    assert.match(bloco, /\(todos os critérios têm evidência suficiente\)/);
    assert.match(bloco, /Tudo coberto/);
    assert.doesNotMatch(bloco, /Próximo alvo/);
  });

  it("corta evidência longa", () => {
    const longa = "x".repeat(400);
    const bloco = blocoDoBriefing(kit, comObservacoes([obs("requisitos", "positivo", longa)]), INICIO + 10 * MIN);
    assert.ok(!bloco.includes("x".repeat(200)));
    assert.match(bloco, /x{160}…/);
  });
});
