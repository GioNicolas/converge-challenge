import assert from "node:assert/strict";
import { test } from "node:test";
import quadro from "../fixtures/quadro-clientes.json";
import { criarConversor } from "../conversor";
import { descreverMudancas } from "../diff";
import type { ExcalidrawElement } from "../tipos";

const cena = quadro as unknown as readonly ExcalidrawElement[];

function alterar(elementos: readonly ExcalidrawElement[], id: string, campos: Record<string, unknown>) {
  return elementos.map((e) => e.id === id ? { ...e, ...campos } as ExcalidrawElement : e);
}

test("caso real (#81): a seta que para 60-100 px antes do quadro liga a ele, marcada como provável", () => {
  const { texto, instantaneo } = criarConversor().converter(cena);
  assert.match(texto, /- \[s1\] Entrada dos clientes → QUADRO DE CLIENTES \(Os dados\)\n/);
  assert.match(texto, /- \[s2\] Entrada dos dados → QUADRO DE CLIENTES \(Os dados\) \(ponta perto, sem encostar\)\n/);
  assert.match(texto, /- \[s3\] Estados dos Pedidos → QUADRO DE CLIENTES \(Os dados\)\n/);
  assert.deepEqual(instantaneo.conexoes.map((c) => c.inferida ?? false), [false, true, false]);
  assert.ok(!texto.includes("?"), texto);
});

test("caso real (#81): o diff também mostra a ligação inferida, sem '?'", () => {
  const conversor = criarConversor();
  const semAFalha = conversor.converter(cena.filter((e) => e.id !== "seta-dados")).instantaneo;
  const agora = conversor.converter(cena).instantaneo;
  const diff = descreverMudancas(semAFalha, agora);
  assert.equal(diff, "+ conectou Entrada dos dados → QUADRO DE CLIENTES (Os dados) (ponta perto, sem encostar)");
  assert.ok(!descreverMudancas(null, agora).includes("?"));
});

test("seta apontando para o vazio continua sem destino, sem '?'", () => {
  const vazio = alterar(cena, "seta-dados", { points: [[0, 0], [136, -150]] });
  const { texto, instantaneo } = criarConversor().converter(vazio);
  assert.match(texto, /- \[s2\] Entrada dos dados → \(sem destino\)\n/);
  assert.equal(instantaneo.conexoes[1].inferida, undefined);
  assert.ok(!texto.includes("?"));
});

test("seta que começa solta vira '(sem origem) → X'", () => {
  // Seta que chega em "Entrada dos dados" e começa solta, longe de qualquer caixa.
  const invertida = alterar(cena, "seta-dados", {
    startBinding: null, endBinding: { elementId: "entrada-dados", focus: 0, gap: 4 },
    points: [[0, 0], [-136, -32]], x: 340, y: 237,
  });
  const longe = alterar(invertida, "quadro-clientes", { x: 1200 });
  assert.match(criarConversor().converter(longe).texto, /- \[s2\] \(sem origem\) → Entrada dos dados\n/);
});

test("a proximidade de 40 px continua valendo antes da direção", () => {
  const { texto, instantaneo } = criarConversor().converter(alterar(cena, "seta-dados", { points: [[0, 0], [216, 32]] }));
  assert.match(texto, /- \[s2\] Entrada dos dados → QUADRO DE CLIENTES \(Os dados\)\n/);
  assert.equal(instantaneo.conexoes[1].inferida, undefined);
});

test("entre duas caixas próximas liga à que está na direção da seta", () => {
  const outra = cena.filter((e) => e.id === "quadro-clientes" || e.id === "txt-quadro-clientes").map((e) => ({
    ...e, id: "outro-" + e.id, y: e.y - 150,
    ...("containerId" in e ? { containerId: "outro-quadro-clientes", text: "Outro", originalText: "Outro" } : {}),
  })) as unknown as ExcalidrawElement[];
  const duas = [...cena, ...outra];
  assert.match(criarConversor().converter(duas).texto, /Entrada dos dados → QUADRO DE CLIENTES \(Os dados\) \(ponta perto/);
  const paraCima = alterar(duas, "seta-dados", { points: [[0, 0], [136, -32]] });
  assert.match(criarConversor().converter(paraCima).texto, /Entrada dos dados → Outro \(ponta perto/);
});

test("caixa fora do alcance não liga", () => {
  const longe = alterar(cena, "quadro-clientes", { x: 1200 });
  assert.match(criarConversor().converter(longe).texto, /Entrada dos dados → \(sem destino\)/);
});
