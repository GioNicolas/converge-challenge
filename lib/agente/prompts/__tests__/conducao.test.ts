// Condução da recrutadora (conductNotes) na sala do quadro: entra no prompt do entrevistador, nunca no do avaliador.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InterviewConfig } from "../../../contracts";
import { blocoDoPlano, blocoDoPlanoParaEntrevistar, planoDaConfig } from "../../plano";
import { blocosDoSistemaDinamicoPerguntarV2 } from "../entrevistador-v2";
import { KIT_SYSTEM_DESIGN as kit } from "../../kits/system-design";
import { estadoInicial } from "../../sessao/estado";

const config = (extra: Partial<InterviewConfig> = {}): InterviewConfig => ({
  id: "cfg-1",
  mode: "system_design",
  roleTitle: "Staff Engineer",
  seniority: "senior",
  focus: [{ area: "escala_produto", weight: 1 }],
  recruiterNotes: "",
  criteria: [{ id: "c1", name: "Escala", description: "pensa em escala", weight: 1, focus: "escala_produto" }],
  problemId: "encurtador-de-url",
  languages: ["python"],
  durationMin: 45,
  ...extra,
});

const promptDoQuadro = (c: InterviewConfig) =>
  blocosDoSistemaDinamicoPerguntarV2(estadoInicial({ criterios: kit.criterios.map((k) => k.id), plano: planoDaConfig(c) }), kit, "APROFUNDAMENTO", [], "", undefined, [], Date.now())
    .map((b) => b.texto)
    .join("");

describe("conductNotes na sala do quadro", () => {
  it("entra no prompt do entrevistador, depois do plano da vaga", () => {
    const texto = promptDoQuadro(config({ conductNotes: ["Pergunte sobre complexidade"] }));
    assert.ok(texto.includes("COMO CONDUZIR (pedido da recrutadora)"));
    assert.ok(texto.includes("- Pergunte sobre complexidade"));
    assert.ok(texto.indexOf("PLANO DA VAGA") < texto.indexOf("COMO CONDUZIR"));
  });

  it("sem conductNotes nada muda no plano nem no prompt", () => {
    const semNotas = config();
    assert.equal("conducao" in planoDaConfig(semNotas), false);
    assert.equal(blocoDoPlanoParaEntrevistar(planoDaConfig(semNotas)), blocoDoPlano(planoDaConfig(semNotas)));
    assert.equal(blocoDoPlanoParaEntrevistar(planoDaConfig(config({ conductNotes: [" "] }))), blocoDoPlano(planoDaConfig(semNotas)));
    assert.ok(!promptDoQuadro(semNotas).includes("COMO CONDUZIR"));
    assert.equal(blocoDoPlanoParaEntrevistar(null), "");
  });

  it("o bloco do plano (que o avaliador usa) nunca leva a condução", () => {
    const plano = planoDaConfig(config({ conductNotes: ["Pergunte sobre complexidade"] }));
    assert.ok(!blocoDoPlano(plano).includes("Pergunte sobre complexidade"));
  });
});
