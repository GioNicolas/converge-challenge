import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gerarAbertura } from "../abertura";
import { KIT_SYSTEM_DESIGN as kitDemo } from "../kits/system-design";
import { criarClienteFalso, ErroLlm } from "../llm/cliente";
import { montarPromptAbertura } from "../prompts/abertura";

const problema = kitDemo.problemas[0];
const deps = (llm: ReturnType<typeof criarClienteFalso>) => ({ llm, kit: kitDemo, problema, log: () => {} });

describe("abertura", () => {
  it("devolve a apresentação e a despedida escritas pelo modelo", async () => {
    const llm = criarClienteFalso([{ apresentacao: "Olá, tudo bem? Vamos já iniciar sua entrevista.", despedida: "Obrigada. Daremos retorno." }]);
    const r = await gerarAbertura(deps(llm));
    assert.deepEqual(r, { apresentacao: "Olá, tudo bem? Vamos já iniciar sua entrevista.", despedida: "Obrigada. Daremos retorno." });
    assert.equal(llm.chamadas.length, 1);
  });

  it("corta falas longas por número de frases (sem lista de palavras)", async () => {
    const llm = criarClienteFalso([{ apresentacao: "Um. Dois. Três. Quatro. Cinco.", despedida: "A. B. C. D." }]);
    const r = await gerarAbertura(deps(llm));
    assert.equal(r?.apresentacao, "Um. Dois. Três. Quatro.");
    assert.equal(r?.despedida, "A. B. C.");
  });

  it("erro, saída fora do schema ou fala vazia: null, sem lançar", async () => {
    assert.equal(await gerarAbertura(deps(criarClienteFalso([new ErroLlm("timeout", "x")]))), null);
    assert.equal(await gerarAbertura(deps(criarClienteFalso([{ apresentacao: "só uma" }]))), null);
    assert.equal(await gerarAbertura(deps(criarClienteFalso([{ apresentacao: "", despedida: "ok." }]))), null);
  });

  it("o prompt não vaza ficha nem rubrica e proíbe nota e elogio", () => {
    const p = montarPromptAbertura(kitDemo, problema);
    const tudo = p.estatico + p.dinamico;
    for (const f of problema.ficha) assert.ok(!tudo.includes(f.resposta));
    for (const c of kitDemo.criterios) for (const n of [1, 2, 3, 4] as const) assert.ok(!tudo.includes(c.niveis[n]));
    assert.ok(p.estatico.includes("Não valide nem elogie"));
    // O Totti se apresenta pelo nome e explica como vai ser, sem falar do próprio cargo.
    assert.ok(p.estatico.includes("se apresente pelo nome"));
    assert.ok(p.estatico.includes("Não fale da sua experiência nem do seu cargo"));
    assert.ok(p.dinamico.includes(kitDemo.area));
    assert.ok(p.estatico.includes("não dê nota"));
    assert.ok(p.dinamico.includes(problema.titulo));
  });

  it("a duração e as etapas vão ao contexto; sem duração, o prompt pede para não citar número", () => {
    const com = montarPromptAbertura(kitDemo, problema, { duracaoMin: 35, etapas: "entender o problema (~5 min)" });
    assert.ok(com.dinamico.includes("cerca de 35 minutos"));
    assert.ok(com.dinamico.includes("entender o problema (~5 min)"));
    assert.ok(montarPromptAbertura(kitDemo, problema).dinamico.includes("não cite um número"));
  });
});
