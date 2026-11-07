import assert from "node:assert/strict";
import { test } from "node:test";
import pontas from "../fixtures/pontas.json";
import { criarConversor } from "../conversor";
import { descreverMudancas, houveMudancaRelevante } from "../diff";
import type { ExcalidrawElement } from "../tipos";

// Todas as setas da fixture foram desenhadas da esquerda para a direita; só as pontas mudam.
const cena = pontas as unknown as readonly ExcalidrawElement[];

function alterar(elementos: readonly ExcalidrawElement[], id: string, campos: Partial<ExcalidrawElement>) {
  // Editar um texto no Excalidraw muda os dois campos.
  const comOriginal = "text" in campos ? { ...campos, originalText: campos.text } : campos;
  return elementos.map((e) => e.id === id ? { ...e, ...comOriginal } as ExcalidrawElement : e);
}

function so(id: string) {
  return cena.filter((e) => e.type !== "arrow" && e.type !== "line" || e.id === id);
}

test("a direção segue as pontas desenhadas", () => {
  const { texto, instantaneo } = criarConversor().converter(cena);
  assert.match(texto, /CONEXÕES\n- \[s1\] Cliente → API\n- \[s2\] Postgres → API\n- \[s3\] Cliente ↔ Postgres\n- \[s4\] Cliente — API\n- \[s5\] API — Postgres\n/);
  assert.deepEqual(instantaneo.conexoes.map((c) => [c.de, c.seta, c.para]), [
    ["r1", "→", "r2"],
    ["e1", "→", "r2"],
    ["r1", "↔", "e1"],
    ["r1", "—", "r2"],
    ["r2", "—", "e1"],
  ]);
});

test("ponta só no começo de uma seta solta inverte também o '?'", () => {
  const solta = alterar(so("so-no-comeco"), "so-no-comeco", { endBinding: null, points: [[0, 0], [2000, 0]] } as unknown as Partial<ExcalidrawElement>);
  assert.match(criarConversor().converter(solta).texto, /\[s1\] \? → API \(seta solta\)/);
});

test("diff: trocar a ponta de lado inverte a seta", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(so("so-no-fim")).instantaneo;
  const agora = conversor.converter(alterar(so("so-no-fim"), "so-no-fim", { startArrowhead: "arrow", endArrowhead: null })).instantaneo;
  assert.equal(descreverMudancas(antes, agora), "~ inverteu a seta: Cliente → API passou a API → Cliente");
  assert.equal(descreverMudancas(agora, antes), "~ inverteu a seta: API → Cliente passou a Cliente → API");
});

test("diff: ganhar ou perder uma ponta muda a seta", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(so("so-no-fim")).instantaneo;
  const duas = conversor.converter(alterar(so("so-no-fim"), "so-no-fim", { startArrowhead: "dot" })).instantaneo;
  assert.equal(descreverMudancas(antes, duas), "~ mudou a seta: Cliente → API passou a Cliente ↔ API");
  const nenhuma = conversor.converter(alterar(so("so-no-fim"), "so-no-fim", { endArrowhead: null })).instantaneo;
  assert.equal(descreverMudancas(antes, nenhuma), "~ mudou a seta: Cliente → API passou a Cliente — API");
});

test("diff: redesenhar ao contrário uma conexão sem direção não é mudança", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(so("nas-duas")).instantaneo;
  const trocada = alterar(so("nas-duas"), "nas-duas", {
    startBinding: { elementId: "postgres-longo", focus: 0, gap: 10 },
    endBinding: { elementId: "cliente-longo", focus: 0, gap: 10 },
  } as Partial<ExcalidrawElement>);
  const agora = conversor.converter(trocada).instantaneo;
  assert.equal(houveMudancaRelevante(antes, agora), false);
});

test("diff: redesenhar ao contrário e mover a ponta para o começo dá a mesma leitura", () => {
  const conversor = criarConversor();
  const antes = conversor.converter(so("so-no-fim")).instantaneo;
  const espelhada = alterar(so("so-no-fim"), "so-no-fim", {
    startBinding: { elementId: "api-longo", focus: 0, gap: 10 },
    endBinding: { elementId: "cliente-longo", focus: 0, gap: 10 },
    startArrowhead: "arrow", endArrowhead: null,
  } as Partial<ExcalidrawElement>);
  assert.equal(descreverMudancas(antes, conversor.converter(espelhada).instantaneo), "");
});

test("diff: inverter e renomear o rótulo saem em linhas separadas", () => {
  const conversor = criarConversor();
  const comRotulo = [...so("so-no-fim"), {
    ...cena.find((e) => e.id === "nome-api")!, id: "rotulo", text: "chama", originalText: "chama", containerId: "so-no-fim",
  } as ExcalidrawElement];
  const antes = conversor.converter(comRotulo).instantaneo;
  const agora = conversor.converter(alterar(
    alterar(comRotulo, "so-no-fim", { startArrowhead: "arrow", endArrowhead: null }),
    "rotulo", { text: "responde" } as Partial<ExcalidrawElement>,
  )).instantaneo;
  assert.equal(descreverMudancas(antes, agora), [
    "~ inverteu a seta: Cliente → API passou a API → Cliente",
    '~ mudou o rótulo de API → Cliente: "chama" → "responde"',
  ].join("\n"));
});
