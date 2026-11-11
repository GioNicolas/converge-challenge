import assert from "node:assert/strict";
import { test } from "node:test";
import encurtador from "../fixtures/encurtador.json";
import visual from "../fixtures/visual.json";
import { criarConversor } from "../conversor";
import { descreverMudancas, houveMudancaRelevante } from "../diff";
import type { ExcalidrawElement } from "../tipos";

const cena = encurtador as unknown as readonly ExcalidrawElement[];
const cenaVisual = visual as unknown as readonly ExcalidrawElement[];

function alterar(elementos: readonly ExcalidrawElement[], id: string, campos: Partial<ExcalidrawElement>) {
  // Editar um texto no Excalidraw muda os dois campos.
  const comOriginal = "text" in campos ? { ...campos, originalText: campos.text } : campos;
  return elementos.map((e) => e.id === id ? { ...e, ...comOriginal } as ExcalidrawElement : e);
}

test("descreve o encurtador no contrato e omite elementos ignorados e seus textos", () => {
  const conversor = criarConversor();
  const resultado = conversor.converter(cena);
  assert.equal(resultado.texto, [
    "COMPONENTES",
    "- [r1] Cliente (retângulo)",
    "- [r2] API (retângulo)",
    "- [e1] Postgres (elipse)",
    "CONEXÕES",
    "- [s1] Cliente → API",
    '- [s2] API → Postgres ("lê e grava")',
    "ANOTAÇÕES SOLTAS",
    '- [t1] "gera código aleatório"',
    "ORDEM NA TELA (esquerda → direita)",
    "- Cliente, API, Postgres",
  ].join("\n"));
  assert.equal(resultado.precisaImagem, false);
  assert.equal(conversor.idCurto("autor-ignorado"), undefined);
  assert.equal(conversor.idCurto("apagado"), undefined);
  assert.equal(conversor.idCurto("texto-do-container-ignorado"), undefined);
});

test("mantém IDs, resolve as duas direções e não reaproveita IDs após remoção", () => {
  const conversor = criarConversor();
  conversor.converter(cena);
  const novo = { ...cena[0], id: "novo-retangulo" };
  conversor.converter([...cena.filter((e) => e.id !== "cliente-longo"), novo]);
  assert.equal(conversor.idCurto("novo-retangulo"), "r3");
  assert.equal(conversor.idCurto("api-longo"), "r2");
  assert.equal(conversor.idReal("r1"), "cliente-longo");
  assert.equal(conversor.idReal("inexistente"), undefined);
  conversor.converter([]);
  conversor.converter(cena);
  assert.equal(conversor.idCurto("cliente-longo"), "r1");
  assert.equal(conversor.idCurto("api-longo"), "r2");
});

test("usa pontas absolutas e distância até o retângulo para setas sem binding", () => {
  const resultado = criarConversor().converter(cenaVisual);
  assert.deepEqual(resultado.instantaneo.conexoes[0], { id: "s1", tipo: "arrow", de: "r1", para: "l1", seta: "→", rotulo: "" });
  assert.match(resultado.texto, /\[s1\] \[r1\] → Decisão/);
  const longe = alterar(cenaVisual, "solta", { points: [[0, 0], [2000, 0]] } as unknown as Partial<ExcalidrawElement>);
  assert.match(criarConversor().converter(longe).texto, /→ \(sem destino\)\n/);
});

test("vínculo explícito ignorado não vaza nem é substituído por proximidade", () => {
  const elementos = alterar(cena, "cliente-api-longo", { startBinding: { elementId: "autor-ignorado", focus: 0, gap: 0 } });
  const resultado = criarConversor().converter(elementos);
  assert.equal(resultado.instantaneo.conexoes[0].de, null);
  assert.match(resultado.texto, /\[s1\] \(sem origem\) → API\n/);
});

test("linhas usam traço sem ponta", () => {
  const resultado = criarConversor().converter(alterar(cena, "cliente-api-longo", { type: "line", endArrowhead: null }));
  assert.match(resultado.texto, /\[s1\] Cliente — API/);
});

test("contenção escolhe o menor recipiente; molduras usam frameId; grupos não duplicam", () => {
  const { instantaneo, texto, precisaImagem } = criarConversor().converter(cenaVisual);
  assert.equal(instantaneo.componentes.find((c) => c.nome === "Worker")?.dentroDe, "r3");
  assert.match(texto, /\[r2\] Worker \(retângulo\)  dentro de \[r3\] Cluster/);
  assert.match(texto, /\[m1\] Backend: \[r2\]/);
  assert.match(texto, /grupo: \[r2\], \[r3\]/);
  assert.equal(instantaneo.secoes.filter((s) => s.tipo === "grupo").length, 1);
  assert.match(texto, /\[f1\] desenho à mão livre, perto de \[l1\]/);
  assert.match(texto, /\[i1\] imagem/);
  assert.equal(precisaImagem, true);
});

test("imagem é necessária para cada caso visual isoladamente", () => {
  for (const id of ["caixa-vazia", "desenho", "imagem"]) {
    assert.equal(criarConversor().converter(cenaVisual.filter((e) => e.id === id)).precisaImagem, true, id);
  }
});

test("quebras de linha são normalizadas, saída tem limite e instantâneo preserva texto completo", () => {
  const nome = "API\n  de criação " + "x".repeat(100);
  const { texto, instantaneo } = criarConversor().converter(alterar(cena, "nome-api", { text: nome }));
  assert.match(texto, /API de criação x+… \(retângulo\)/);
  assert.equal(instantaneo.componentes[1].nome, nome.replace(/\s+/gu, " ").trim());
  assert.equal(texto.includes("x".repeat(100)), false);
});

test("linhas seguem o array, enquanto ordem na tela segue centros em x", () => {
  const elementos = alterar(cena, "cliente-longo", { x: 900 });
  const { texto } = criarConversor().converter(elementos);
  assert.ok(texto.indexOf("[r1] Cliente") < texto.indexOf("[r2] API"));
  assert.ok(texto.endsWith("- API, Postgres, Cliente"));
});

test("conversão não altera a entrada e instantâneos anteriores não mudam", () => {
  const entrada = JSON.parse(JSON.stringify(cena)) as ExcalidrawElement[];
  const original = JSON.stringify(entrada);
  const conversor = criarConversor();
  const antes = conversor.converter(entrada);
  const copia = JSON.stringify(antes);
  conversor.converter(alterar(entrada, "nome-api", { text: "Novo nome" }));
  assert.equal(JSON.stringify(entrada), original);
  assert.equal(JSON.stringify(antes), copia);
});

test("cena vazia conserva os dois títulos obrigatórios", () => {
  const resultado = criarConversor().converter([]);
  assert.equal(resultado.texto, "COMPONENTES\nCONEXÕES");
  assert.equal(resultado.precisaImagem, false);
  assert.equal(descreverMudancas(null, resultado.instantaneo), "");
});

test("diff ignora movimento, tamanho, estilo e ordem do array sem mudança semântica", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(cena).instantaneo;
  const movida = alterar(cena, "cliente-longo", { x: -500, y: 300, width: 130, height: 70, strokeColor: "red", opacity: 50, version: 2 });
  const agora = conversor.converter([...movida].reverse()).instantaneo;
  assert.equal(descreverMudancas(antes, agora), "");
  assert.equal(houveMudancaRelevante(antes, agora), false);
});

test("diff renomeia sem recriar conexões", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(cena).instantaneo;
  const agora = conversor.converter(alterar(cena, "nome-api", { text: "API de criação" })).instantaneo;
  assert.equal(descreverMudancas(antes, agora), "~ renomeou [r2] API → API de criação");
  assert.equal(houveMudancaRelevante(antes, agora), true);
});

test("diff conecta nova seta e desconecta seta removida", () => {
  const conversor = criarConversor();
  const semSeta = cena.filter((e) => e.id !== "cliente-api-longo");
  const antes = conversor.converter(semSeta).instantaneo;
  const agora = conversor.converter(cena).instantaneo;
  assert.equal(descreverMudancas(antes, agora), "+ conectou Cliente → API");
  assert.equal(descreverMudancas(agora, antes), "- desconectou Cliente → API");
});

test("diff detecta rótulos, troca de pontas e mudança de tipo", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(cena).instantaneo;
  const rotulada = conversor.converter(alterar(cena, "rotulo-gravacao", { text: "grava" })).instantaneo;
  assert.equal(descreverMudancas(antes, rotulada), '~ mudou o rótulo de API → Postgres: "lê e grava" → "grava"');
  const reconectada = conversor.converter(alterar(cena, "cliente-api-longo", { endBinding: { elementId: "postgres-longo", focus: 0, gap: 0 } })).instantaneo;
  assert.equal(descreverMudancas(antes, reconectada), "- desconectou Cliente → API\n+ conectou Cliente → Postgres");
  const novoTipo = conversor.converter(alterar(cena, "api-longo", { type: "diamond" })).instantaneo;
  assert.equal(descreverMudancas(antes, novoTipo), "~ mudou o tipo de [r2]: retângulo → losango");
});

test("diff de notas e remoção de componentes", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(cena).instantaneo;
  const editada = conversor.converter(alterar(cena, "nota-longo", { text: "100 mil req/s" })).instantaneo;
  assert.equal(descreverMudancas(antes, editada), '~ alterou a anotação [t1]: "gera código aleatório" → "100 mil req/s"');
  const removida = conversor.converter(cena.filter((e) => !["nota-longo", "api-longo"].includes(e.id))).instantaneo;
  assert.match(descreverMudancas(antes, removida), /- removeu \[r2\] API/);
  assert.match(descreverMudancas(antes, removida), /- apagou a anotação \[t1\]/);
});

test("diff inicial descreve todos os elementos, conexões e notas como adições", () => {
  const atual = criarConversor().converter(cena).instantaneo;
  assert.equal(descreverMudancas(null, atual), [
    "+ adicionou [r1] Cliente", "+ adicionou [r2] API", "+ adicionou [e1] Postgres",
    "+ conectou Cliente → API", '+ conectou API → Postgres ("lê e grava")',
    '+ anotou [t1] "gera código aleatório"',
  ].join("\n"));
});

test("diff detecta entrada e saída de recipiente e alteração de seções", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(cenaVisual).instantaneo;
  const movida = alterar(cenaVisual, "worker", { x: 750, frameId: null, groupIds: [] });
  const agora = conversor.converter(movida).instantaneo;
  assert.match(descreverMudancas(antes, agora), /~ moveu \[r2\] Worker para fora de \[r3\] Cluster/);
  assert.match(descreverMudancas(agora, antes), /~ moveu \[r2\] Worker para dentro de \[r3\] Cluster/);
  assert.match(descreverMudancas(antes, agora), /~ alterou a seção \[m1\] Backend:/);
  assert.match(descreverMudancas(antes, agora), /~ alterou a seção grupo: \[r3\]/);
  assert.equal(descreverMudancas(antes, { ...antes, secoes: antes.secoes.map((s) => ({ ...s, membros: [...s.membros].reverse() })) }), "");
});

test("diff detecta nomes de molduras e adição e remoção de desenhos", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(cenaVisual).instantaneo;
  const agora = conversor.converter(alterar(cenaVisual.filter((e) => e.type !== "freedraw" && e.type !== "image"), "moldura", { name: "Dados" })).instantaneo;
  const diff = descreverMudancas(antes, agora);
  assert.match(diff, /~ alterou a seção \[m1\] Dados:/);
  assert.match(diff, /- removeu \[f1\] desenho à mão livre/);
  assert.match(diff, /- removeu \[i1\] imagem/);
  assert.match(descreverMudancas(null, antes), /\+ adicionou \[f1\] desenho à mão livre/);
  assert.ok(descreverMudancas(null, antes).split("\n").every((linha) => linha.startsWith("+ ")));
});

test("elementos visuais ignorados e anotações apagadas não exigem imagem nem geram diff", () => {
  const ignorados = cenaVisual.map((e) => ({ ...e, customData: { autor: "agente" } }));
  const conversor = criarConversor();
  const antes = conversor.converter([]).instantaneo;
  const agora = conversor.converter(ignorados);
  assert.equal(agora.texto, "COMPONENTES\nCONEXÕES");
  assert.equal(agora.precisaImagem, false);
  assert.equal(descreverMudancas(antes, agora.instantaneo), "");
  const notaApagada = alterar(cena, "nota-longo", { isDeleted: true });
  assert.equal(conversor.converter(notaApagada).instantaneo.anotacoes.length, 0);
});

test("limiar de proximidade inclui 40 px e exclui distâncias maiores", () => {
  const caixa = cenaVisual[0];
  const seta = cenaVisual.find((e) => e.id === "solta")!;
  const perto = alterar([caixa, seta], "solta", { x: 160 });
  const longe = alterar([caixa, seta], "solta", { x: 160.1 });
  assert.equal(criarConversor().converter(perto).instantaneo.conexoes[0].de, "r1");
  // Passou dos 40 px: já não "encosta", mas a ponta ainda aponta para a caixa, então vira ligação provável.
  const resultadoLonge = criarConversor().converter(longe).instantaneo.conexoes[0];
  assert.equal(resultadoLonge.de, "r1");
  assert.equal(resultadoLonge.inferida, true);
  assert.equal(criarConversor().converter(perto).instantaneo.conexoes[0].inferida, undefined);
});

test("diff usa textos completos mesmo quando a parte alterada ultrapassa o corte visual", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(alterar(cena, "nome-api", { text: "x".repeat(100) + "a" })).instantaneo;
  const agora = conversor.converter(alterar(cena, "nome-api", { text: "x".repeat(100) + "b" })).instantaneo;
  assert.equal(houveMudancaRelevante(antes, agora), true);
});

test("nome da forma usa o texto digitado, não as quebras automáticas do Excalidraw", () => {
  // Como o Excalidraw guarda: `text` quebrado para caber na elipse, `originalText` como foi digitado.
  const quebrado = cena.map((e) => e.id === "nome-postgres" ? { ...e, text: "Postgr\nes", originalText: "Postgres" } as ExcalidrawElement : e);
  const { texto } = criarConversor().converter(quebrado);
  assert.match(texto, /- \[e1\] Postgres \(elipse\)/);
  assert.doesNotMatch(texto, /Postgr es/);
});
