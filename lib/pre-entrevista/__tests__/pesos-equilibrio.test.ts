/**
 * Issue #77: "O que mais pesa" caía sempre em 100% numa área só. Pedir equilíbrio tirava a área técnica.
 * Cobre o nível "reduzir", a divisão pedida (equilíbrio e proporção), a confirmação antes de tirar a área técnica em
 * live coding, o guia seguindo os pesos finais e o corte de frase em "Next.js".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acumularEnfase,
  confirmarDispensa,
  dispensasPendentes,
  estadoInicialEnfase,
  leituraDoEstado,
  lerDivisao,
  type EstadoEnfase,
} from "@/lib/pre-entrevista/enfase";
import { fraseDaDivisao, pesosPelaEnfase, percentualPorExtenso, type EntradaPesos } from "@/lib/pre-entrevista/pesos";
import { montarGuia, ordemDoGuia, type EntradaGuia } from "@/lib/pre-entrevista/guia";
import { frasesDe } from "@/lib/pre-entrevista/frases";
import { nomeAreaFala } from "@/lib/pre-entrevista/cobertura";
import { proximoPasso, planoInicial, type EstadoPlanejamento } from "@/lib/pre-entrevista/planejador";
import { comSugestaoAceita, confirmarDispensasPerguntadas, divisaoDaFala } from "@/lib/pre-entrevista/turno";
import type { Foco } from "@/lib/pre-entrevista/rascunho";

/** Entrada dos pesos a partir do estado de ênfase, como `recalcularRascunho` monta. */
function entrada(estado: EstadoEnfase, focoAnterior: Foco[], mode: EntradaPesos["mode"] = "live_coding"): EntradaPesos {
  const l = leituraDoEstado(estado);
  return {
    mode,
    focoAnterior,
    enfase: l.enfase,
    falou: l.falou,
    fixou: l.fixou,
    dispensadas: l.dispensadas,
    ...(l.divisao ? { divisao: l.divisao } : {}),
    notaVaga: { tecnico: 3, pressao: 1 },
    decisoes: {},
  };
}

const peso = (focus: Foco[], area: string) => focus.find((f) => f.area === area)?.weight ?? 0;

describe("nível reduzir: pesar menos não tira a área", () => {
  it("'a parte técnica pode pesar menos' mantém a técnica no foco, com ênfase 1", () => {
    let estado = acumularEnfase(estadoInicialEnfase(), { tecnico: "central" }, "O principal é o código.");
    estado = acumularEnfase(estado, { tecnico: "reduzir" }, "A parte técnica pode pesar menos.", { mode: "live_coding" });
    assert.equal(estado.tecnico.declarado, "reduzir");
    assert.equal(leituraDoEstado(estado).enfase.tecnico, 1);
    assert.deepEqual(leituraDoEstado(estado).dispensadas, []);
    const { focus } = pesosPelaEnfase(entrada(estado, [{ area: "tecnico", weight: 1 }]));
    assert.ok(peso(focus, "tecnico") > 0, "a técnica continua no foco");
  });

  it("a única área do foco não sai por reduzir", () => {
    const estado = acumularEnfase(estadoInicialEnfase(), { tecnico: "reduzir" }, "Não é tão importante o código.");
    const { focus } = pesosPelaEnfase(entrada(estado, [{ area: "tecnico", weight: 1 }]));
    assert.deepEqual(focus, [{ area: "tecnico", weight: 1 }]);
  });

  it("somar uma área nova não tira a que já estava", () => {
    const estado = acumularEnfase(estadoInicialEnfase(), { pressao: "central" }, "Pode colocar pressão, é o mais importante.");
    const { focus } = pesosPelaEnfase(entrada(estado, [{ area: "tecnico", weight: 1 }]));
    assert.ok(peso(focus, "tecnico") > 0);
    assert.ok(peso(focus, "pressao") > 0);
  });
});

describe("divisão pedida: equilíbrio e proporção", () => {
  it("lê equilíbrio, proporção com número, por extenso e comparativo", () => {
    assert.equal(lerDivisao("Deixa mais equilibrado.", ["tecnico"])?.tipo, "equilibrio");
    assert.equal(lerDivisao("Pode ser meio a meio", ["tecnico", "pressao"])?.tipo, "equilibrio");
    assert.equal(lerDivisao("cinquenta cinquenta", ["tecnico", "pressao"])?.tipo, "equilibrio");
    assert.deepEqual(lerDivisao("Setenta trinta.", ["tecnico", "pressao"]), {
      tipo: "proporcao",
      pesos: { tecnico: 0.7, pressao: 0.3 },
      frase: "Setenta trinta.",
    });
    const dita = lerDivisao("70% pressão e 30% código", ["tecnico", "pressao"]);
    assert.deepEqual(dita?.tipo === "proporcao" && dita.pesos, { pressao: 0.7, tecnico: 0.3 });
    const comparativo = lerDivisao("Quero mais técnico que pressão", ["pressao", "tecnico"]);
    assert.deepEqual(comparativo?.tipo === "proporcao" && comparativo.pesos, { tecnico: 0.6, pressao: 0.4 });
  });

  it("não lê divisão onde não há", () => {
    assert.equal(lerDivisao("Quero ver se ele mantém o equilíbrio sob pressão", ["tecnico"]), undefined);
    assert.equal(lerDivisao("Uns quarenta e cinco minutos", ["tecnico", "pressao"]), undefined);
    assert.equal(lerDivisao("O que mais importa é código que funcione", ["tecnico", "pressao"]), undefined);
  });

  it("o sinal do Jev vale como equilíbrio quando o código não reconhece as palavras", () => {
    assert.equal(divisaoDaFala("Não quero tudo numa coisa só", ["tecnico"], { pediu_equilibrio: 0.9 })?.tipo, "equilibrio");
    assert.equal(divisaoDaFala("Pode ser", ["tecnico"], { pediu_equilibrio: 0.1 }), undefined);
  });

  it("foco 100% técnico + 'deixa mais equilibrado' + aceitar pressão: técnico e pressão perto de 50/50", () => {
    // Fala 1: ela pede equilíbrio. O Jev lê "reduzir" para a técnica; o foco ainda tem só ela.
    let estado = acumularEnfase(estadoInicialEnfase(), { tecnico: "reduzir" }, "Deixa mais equilibrado.", {
      mode: "live_coding",
      divisao: lerDivisao("Deixa mais equilibrado.", ["tecnico"]),
    });
    let { focus } = pesosPelaEnfase(entrada(estado, [{ area: "tecnico", weight: 1 }]));
    assert.deepEqual(focus, [{ area: "tecnico", weight: 1 }]);
    // Fala 2: o Totti sugeriu somar pressão e ela aceitou ("pode ser"). O Jev não leu nada sobre pressão.
    const ultimoPasso = { tipo: "confirmar_mudanca_foco" as const, entra: [], sai: [], duvida: [], divisao: true, sugerir: "pressao" as const };
    const niveis = comSugestaoAceita({}, ultimoPasso, {}, "Pode ser.");
    assert.equal(niveis.pressao, "secundaria");
    estado = acumularEnfase(estado, niveis, "Pode ser.", { mode: "live_coding" });
    ({ focus } = pesosPelaEnfase(entrada(estado, focus)));
    assert.equal(peso(focus, "tecnico"), 0.5);
    assert.equal(peso(focus, "pressao"), 0.5);
  });

  it("proporção dita vale sobre a ênfase das falas seguintes", () => {
    let estado = acumularEnfase(estadoInicialEnfase(), { tecnico: "respondeu", pressao: "respondeu" }, "Setenta trinta", {
      divisao: lerDivisao("Setenta trinta", ["tecnico", "pressao"]),
    });
    estado = acumularEnfase(estado, { pressao: "central" }, "Pressão é o mais importante pra gente.");
    const { focus } = pesosPelaEnfase(entrada(estado, [{ area: "tecnico", weight: 0.5 }, { area: "pressao", weight: 0.5 }]));
    assert.equal(peso(focus, "tecnico"), 0.7);
    assert.equal(peso(focus, "pressao"), 0.3);
  });

  it("a divisão em palavras", () => {
    const nome = (a: Foco["area"]) => nomeAreaFala(a, "live_coding");
    assert.equal(
      fraseDaDivisao([{ area: "tecnico", weight: 0.5 }, { area: "pressao", weight: 0.5 }], nome),
      "fica metade algoritmos e código, metade lidar com pressão e imprevistos",
    );
    assert.equal(
      fraseDaDivisao([{ area: "pressao", weight: 0.3 }, { area: "tecnico", weight: 0.7 }], nome),
      "algoritmos e código fica com setenta por cento e lidar com pressão e imprevistos com trinta",
    );
    assert.equal(fraseDaDivisao([{ area: "tecnico", weight: 1 }], nome), "fica tudo em algoritmos e código");
    assert.equal(percentualPorExtenso(35), "trinta e cinco");
    assert.equal(percentualPorExtenso(15), "quinze");
  });
});

describe("live coding: tirar a área técnica pede confirmação", () => {
  it("'pode tirar a parte técnica' fica pendente e a técnica segue no foco até ela confirmar", () => {
    const estado = acumularEnfase(estadoInicialEnfase(), { tecnico: "dispensou" }, "Pode tirar a parte técnica.", { mode: "live_coding" });
    assert.deepEqual(dispensasPendentes(estado), ["tecnico"]);
    assert.deepEqual(leituraDoEstado(estado).dispensadas, []);
    const { focus } = pesosPelaEnfase(entrada(estado, [{ area: "tecnico", weight: 0.5 }, { area: "pressao", weight: 0.5 }]));
    assert.ok(peso(focus, "tecnico") > 0);

    const confirmado = confirmarDispensa(estado, "tecnico");
    assert.deepEqual(leituraDoEstado(confirmado).dispensadas, ["tecnico"]);
  });

  it("em system design a dispensa vale direto", () => {
    const estado = acumularEnfase(estadoInicialEnfase(), { tecnico: "dispensou" }, "Pode tirar a parte técnica.", { mode: "system_design" });
    assert.deepEqual(leituraDoEstado(estado).dispensadas, ["tecnico"]);
  });

  it("falar do que espera da área desfaz a dispensa pendente: a área fica pesando menos", () => {
    let estado = acumularEnfase(estadoInicialEnfase(), { tecnico: "dispensou" }, "Pode tirar a parte técnica.", { mode: "live_coding" });
    estado = acumularEnfase(estado, { tecnico: "respondeu" }, "Não, quero ver se o código roda.", { mode: "live_coding" });
    assert.equal(estado.tecnico.declarado, "reduzir");
    assert.deepEqual(dispensasPendentes(estado), []);
  });

  it("o planejador pergunta antes de tirar, sem emendar outra pergunta; o 'é isso' dela confirma", () => {
    const e: EstadoPlanejamento = {
      ...planoInicial(),
      mode: "live_coding",
      focus: [{ area: "tecnico", weight: 0.5 }, { area: "pressao", weight: 0.5 }],
      cobertura: { confirmou_inicio: 1 },
      sinais: { dispensa_tecnico: 0.9, quer_pressao: 0.9 },
      dispensasPendentes: ["tecnico"],
    };
    const passo = proximoPasso(e);
    assert.equal(passo.tipo, "confirmar_mudanca_foco");
    assert.ok(passo.tipo === "confirmar_mudanca_foco" && passo.confirmarTirar?.includes("tecnico"));
    assert.ok(passo.tipo === "confirmar_mudanca_foco" && passo.proximo === undefined);

    const pendente = acumularEnfase(estadoInicialEnfase(), { tecnico: "dispensou" }, "Pode tirar a parte técnica.", { mode: "live_coding" });
    const depois = confirmarDispensasPerguntadas(pendente, passo, { confirmou_tirar_area: 0.9 });
    assert.deepEqual(leituraDoEstado(depois).dispensadas, ["tecnico"]);
    assert.equal(confirmarDispensasPerguntadas(pendente, passo, { confirmou_tirar_area: 0.1 }), pendente);
  });
});

describe("guia coerente com os pesos", () => {
  const base: EntradaGuia = {
    mode: "live_coding",
    focus: [],
    enfase: {},
    dispensadas: [],
    frases: {},
    eliminatorios: [],
    contexto: "",
    tom: "amigavel",
    dicas: "leves",
    naoAvaliado: [],
  };

  it("cfg-mwcar7wdmdog: técnico 0,67 e pressão 0,33 → o que mais importa é o técnico", () => {
    const guia = montarGuia({
      ...base,
      focus: ["tecnico", "pressao"],
      pesos: { tecnico: 0.67, pressao: 0.33 },
      frases: { pressao: "lidar com pressão e imprevistos" },
    });
    assert.match(guia, /O que mais importa: algoritmos e código\./);
    assert.match(guia, /Menos importante: lidar com pressão e imprevistos\./);
  });

  it("cfg-mwbgqqh2xm66: pressão 0,4, escala 0,4, técnico 0,2 em system design", () => {
    const { mais, menos } = ordemDoGuia({
      ...base,
      mode: "system_design",
      focus: ["tecnico", "pressao", "escala_produto"],
      pesos: { pressao: 0.4, escala_produto: 0.4, tecnico: 0.2 },
    });
    assert.deepEqual(new Set(mais), new Set(["pressao", "escala_produto"]));
    assert.deepEqual(menos, ["tecnico"]);
  });

  it("cfg-mwc4z7i7mij7: em live coding o técnico nunca é 'menos importante'", () => {
    const guia = montarGuia({ ...base, focus: ["pressao", "tecnico"], pesos: { pressao: 0.7, tecnico: 0.3 } });
    assert.match(guia, /O que mais importa: lidar com pressão e imprevistos\./);
    assert.doesNotMatch(guia, /Menos importante: algoritmos/);
  });

  it("com pesos iguais não há 'menos importante' no foco; a frase dela só é citada para a área de maior peso", () => {
    const guia = montarGuia({
      ...base,
      focus: ["tecnico", "pressao"],
      pesos: { tecnico: 0.5, pressao: 0.5 },
      frases: { pressao: "Quero ver como ele lida com prazo curto." },
    });
    assert.match(guia, /O que mais importa: algoritmos e código; “Quero ver como ele lida com prazo curto”\./);
    assert.doesNotMatch(guia, /Menos importante/);
  });
});

describe("corte de frase", () => {
  it("não quebra 'Next.js' nem 'Node. js' (transcrição de voz)", () => {
    assert.deepEqual(frasesDe("Usamos React com Next.js e Node.js. O time é pequeno."), [
      "Usamos React com Next.js e Node.js.",
      "O time é pequeno.",
    ]);
    assert.deepEqual(frasesDe("Usamos Next. js e Node. js. O time é pequeno."), ["Usamos Next. js e Node. js.", "O time é pequeno."]);
  });
});
