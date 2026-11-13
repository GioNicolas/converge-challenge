import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gerarAbertura, MAX_CARACTERES_APRESENTACAO, MAX_FRASES } from "../abertura";
import { KIT_SYSTEM_DESIGN as kitDemo } from "../kits/system-design";
import { criarClienteFalso, ErroLlm } from "../llm/cliente";
import { apresentacaoReserva, montarPromptAbertura } from "../prompts/abertura";

const problema = kitDemo.problemas[0];
const deps = (llm: ReturnType<typeof criarClienteFalso>) => ({ llm, kit: kitDemo, problema, log: () => {} });

describe("abertura", () => {
  it("devolve a apresentação e a despedida escritas pelo modelo", async () => {
    const llm = criarClienteFalso([{ apresentacao: "Olá, tudo bem? Vamos já iniciar sua entrevista.", despedida: "Obrigada. Daremos retorno." }]);
    const r = await gerarAbertura(deps(llm));
    assert.deepEqual(r, { apresentacao: "Olá, tudo bem? Vamos já iniciar sua entrevista.", despedida: "Obrigada. Daremos retorno." });
    assert.equal(llm.chamadas.length, 1);
  });

  it("corta falas longas por número de frases e reserva se exceder caracteres", async () => {
    const llm = criarClienteFalso([{ apresentacao: "Um. Dois. Três. Quatro. Cinco.", despedida: "A. B. C. D." }]);
    const r = await gerarAbertura(deps(llm));
    assert.equal(r?.apresentacao, "Um. Dois.");
    assert.equal(r?.despedida, "A. B. C.");
  });

  it("mantém 10 gerações seguidas em até 2 frases e 160 caracteres", async () => {
    const respostas = Array.from({ length: 10 }, (_, i) => ({
      apresentacao: i === 4
        ? `Esta fala é longa demais, ${"e continua com detalhes desnecessários ".repeat(8)} até passar muito de cento e sessenta caracteres.`
        : "Oi, tudo bem? Eu sou o Totti. Vamos conversar sobre o desafio.",
      despedida: "Obrigado pela conversa.",
    }));
    const llm = criarClienteFalso(respostas);
    const resultados = await Promise.all(respostas.map(() => gerarAbertura(deps(llm))));
    assert.equal(resultados.length, 10);
    for (const resultado of resultados) {
      assert.ok(resultado);
      assert.ok(resultado.apresentacao.length <= MAX_CARACTERES_APRESENTACAO);
      assert.ok(resultado.apresentacao.split(/[.!?]+/).filter((frase) => frase.trim()).length <= MAX_FRASES);
    }
    assert.equal(resultados[4]?.apresentacao, apresentacaoReserva(kitDemo));
    assert.ok(apresentacaoReserva(kitDemo, { duracaoMin: 15 }).length <= MAX_CARACTERES_APRESENTACAO);
  });

  it("erro, saída fora do schema ou fala vazia: null, sem lançar", async () => {
    assert.equal(await gerarAbertura(deps(criarClienteFalso([new ErroLlm("timeout", "x")]))), null);
    assert.equal(await gerarAbertura(deps(criarClienteFalso([{ apresentacao: "só uma" }]))), null);
    assert.equal(
      (await gerarAbertura(deps(criarClienteFalso([{ apresentacao: "", despedida: "ok." }]))))?.apresentacao,
      apresentacaoReserva(kitDemo),
    );
  });

  it("o prompt não vaza ficha nem rubrica e proíbe nota e elogio", () => {
    const p = montarPromptAbertura(kitDemo, problema);
    const tudo = p.estatico + p.dinamico;
    for (const f of problema.ficha) assert.ok(!tudo.includes(f.resposta));
    for (const c of kitDemo.criterios) for (const n of [1, 2, 3, 4] as const) assert.ok(!tudo.includes(c.niveis[n]));
    assert.ok(p.estatico.includes("Não valide nem elogie"));
    // A apresentação fica curta e deixa as instruções detalhadas para o desafio e a tela.
    assert.ok(p.estatico.includes("se apresente pelo nome"));
    assert.ok(p.estatico.includes("160 caracteres"));
    assert.ok(p.estatico.includes("No máximo 2 frases"));
    assert.ok(p.estatico.includes("Não fale da sua experiência nem do seu cargo"));
    assert.ok(p.dinamico.includes(kitDemo.area));
    assert.ok(p.estatico.includes("não dê nota"));
    assert.ok(p.dinamico.includes(problema.titulo));
  });

  it("a duração vai ao contexto; sem duração, o prompt pede para não citar número", () => {
    const com = montarPromptAbertura(kitDemo, problema, { duracaoMin: 35, etapas: "entender o problema (~5 min)" });
    assert.ok(com.dinamico.includes("cerca de 35 minutos"));
    assert.ok(com.dinamico.includes("entender o problema (~5 min)"));
    assert.ok(montarPromptAbertura(kitDemo, problema).dinamico.includes("não cite um número"));
  });
});

describe("português claro na abertura (#129, decisão H)", () => {
  it("as falas de apresentação e despedida seguem a regra de termo em português", () => {
    const { estatico } = montarPromptAbertura(kitDemo, kitDemo.problemas[0]);
    assert.match(estatico, /Português claro: termo do domínio em português \("entregador", "pedido", "lojista", "fila"\)/);
  });
});
