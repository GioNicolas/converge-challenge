import assert from "node:assert/strict";
import { test } from "node:test";
import { EsquemaVisualOpcional, criarMemoriaVisual, escolherAcoesVisuais, mapearAcoesVisuais, type AcaoVisual } from "../acoesVisuais";
import { comporGestos, lugarDaAnotacao } from "../gestos";

const area = { x: 0, y: 0, largura: 1000, altura: 700 };
const caixa = { x: 100, y: 200, largura: 160, altura: 80 };
const caixas = new Map([["r1", caixa], ["e1", { x: 500, y: 200, largura: 100, altura: 100 }]]);

test("plano inválido não quebra a fala e um traço não aceita pontos fora da região", () => {
  assert.equal(EsquemaVisualOpcional.parse([{ tipo: "traco", alvo: "r1", pontos: [[0, 0], [Infinity, 1]] }]), undefined);
  assert.equal(EsquemaVisualOpcional.parse(Array(6).fill({ tipo: "apontar", alvo: "r1" })), undefined);
  assert.deepEqual(EsquemaVisualOpcional.parse([]), []);
});
test("referência inexistente é descartada, preservando as ações válidas", () => {
  const plano: AcaoVisual[] = [{ tipo: "comparar", alvos: ["r1", "inventado"] }, { tipo: "sublinhar", alvo: "e1" }, { tipo: "anotar", texto: "Pergunta geral" }];
  assert.deepEqual(mapearAcoesVisuais(plano, (id) => caixas.has(id) ? `real-${id}` : null), [
    { tipo: "sublinhar", alvo: "real-e1" }, { tipo: "anotar", texto: "Pergunta geral" },
  ]);
});
test("memória evita repetir a marca no mesmo alvo e respeita só falar", () => {
  const memoria = criarMemoriaVisual();
  const plano: AcaoVisual[] = [{ tipo: "colchetes", alvo: "r1" }];
  assert.equal(escolherAcoesVisuais(plano, [], "", memoria).length, 1);
  assert.deepEqual(escolherAcoesVisuais(plano, [], "", memoria), []);
  assert.deepEqual(escolherAcoesVisuais([], ["r1"], "nota", memoria), []);
});
test("fallback varia o gesto sem fabricar desenho quando não há alvo", () => {
  const memoria = criarMemoriaVisual();
  const tipos = Array.from({ length: 5 }, () => escolherAcoesVisuais(undefined, ["r1"], "", memoria)[0]?.tipo);
  assert.equal(new Set(tipos).size, 5);
  assert.deepEqual(escolherAcoesVisuais(undefined, [], "nota", memoria), []);
});
test("traço livre usa os pontos do modelo na região do alvo, sem alterar a caixa", () => {
  const original = structuredClone(caixa);
  const gestos = comporGestos({ tipo: "traco", alvo: "r1", pontos: [[0, 0], [0.25, 1], [1, 0.5]] }, caixas, area, 1);
  assert.deepEqual(gestos, [{ tipo: "traco", traco: { origem: { x: 100, y: 200 }, pontos: [[-10, -10], [35, 90], [170, 40]] } }]);
  assert.deepEqual(caixa, original);
});
test("percorrer acompanha o fluxo com o cursor, sem inventar conexões", () => {
  const gestos = comporGestos({ tipo: "percorrer", alvos: ["r1", "e1"] }, caixas, area, 1);
  assert.equal(gestos.length, 2);
  assert.ok(gestos.every((g) => g.tipo === "apontar"));
  assert.deepEqual(comporGestos({ tipo: "percorrer", alvos: ["r1", "sumiu"] }, caixas, area, 1), []);
});
test("anotação procura espaço visível sem cobrir os elementos", () => {
  const lugar = lugarDaAnotacao("E a leitura?", caixa, [...caixas.values()], area);
  assert.ok(lugar.x >= 0 && lugar.y >= 0 && lugar.x + lugar.largura <= area.largura && lugar.y + lugar.altura <= area.altura);
  for (const c of caixas.values()) assert.ok(lugar.x >= c.x + c.largura || lugar.x + lugar.largura <= c.x || lugar.y >= c.y + c.altura || lugar.y + lugar.altura <= c.y);
});

test("em seta diagonal longa, apontar e circular miram o meio do traço, não a caixa inteira", () => {
  // Seta de (0,0) a (600,400): a caixa cobre o quadro quase todo; o meio do traço é (300,200).
  const seta = { x: 0, y: 0, largura: 600, altura: 400, pontos: [[0, 0], [600, 400]] as const };
  const comSeta = new Map([["s1", seta]]);
  const [apontar] = comporGestos({ tipo: "apontar", alvo: "s1" }, comSeta, area, 1);
  assert.deepEqual(apontar, { tipo: "apontar", ponto: { x: 300, y: 200 } });
  const [circulo] = comporGestos({ tipo: "circular", alvo: "s1" }, comSeta, area, 1);
  assert.equal(circulo.tipo, "traco");
  if (circulo.tipo !== "traco") return;
  const xs = circulo.traco.pontos.map(([x]) => circulo.traco.origem.x + x);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 200, "o círculo fica pequeno, em volta do meio da seta");
});
