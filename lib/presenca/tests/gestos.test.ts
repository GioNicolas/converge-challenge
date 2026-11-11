import assert from "node:assert/strict";
import { test } from "node:test";
import { EsquemaVisualOpcional, criarMemoriaVisual, escolherAcoesVisuais, mapearAcoesVisuais, type AcaoVisual } from "../acoesVisuais";
import { comporGestos, FOLGA_DA_MARCA, formaDoElemento, lugarDaAnotacao, type CaixaComPontos, type Gesto } from "../gestos";
import { garantirMarca } from "../acoesVisuais";

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
test("fallback pede a intenção (marcar), sem sortear geometria, e não fabrica desenho sem alvo", () => {
  const memoria = criarMemoriaVisual();
  assert.deepEqual(escolherAcoesVisuais(undefined, ["r1"], "", memoria), [{ tipo: "marcar", alvo: "r1" }]);
  // Acabou de marcar ali: aponta em vez de repetir a mesma marca.
  assert.deepEqual(escolherAcoesVisuais(undefined, ["r1"], "", memoria), [{ tipo: "apontar", alvo: "r1" }]);
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
  assert.equal(apontar.tipo, "traco");
  if (apontar.tipo !== "traco") return;
  const [px, py] = apontar.traco.pontos.at(-1)!;
  const ponta = { x: apontar.traco.origem.x + px, y: apontar.traco.origem.y + py };
  assert.ok(Math.hypot(ponta.x - 300, ponta.y - 200) < 20, "a setinha para perto do meio do traço");
  const [circulo] = comporGestos({ tipo: "circular", alvo: "s1" }, comSeta, area, 1);
  assert.equal(circulo.tipo, "traco");
  if (circulo.tipo !== "traco") return;
  const xs = circulo.traco.pontos.map(([x]) => circulo.traco.origem.x + x);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 200, "o círculo fica pequeno, em volta do meio da seta");
});

// Quadro de exemplo com os cinco tipos de alvo (o mesmo de app/dev/gestos).
const ELIPSE: CaixaComPontos = { x: 100, y: 100, largura: 200, altura: 100, forma: "elipse" };
const RETANGULO: CaixaComPontos = { x: 400, y: 100, largura: 180, altura: 90, forma: "retangulo" };
const LOSANGO: CaixaComPontos = { x: 100, y: 320, largura: 160, altura: 120, forma: "losango" };
const SETA: CaixaComPontos = { x: 300, y: 150, largura: 100, altura: 0, forma: "seta", pontos: [[0, 0], [100, 0]] };
const TEXTO: CaixaComPontos = { x: 400, y: 340, largura: 150, altura: 25, forma: "texto" };
const ALVOS = new Map<string, CaixaComPontos>([["e1", ELIPSE], ["r1", RETANGULO], ["d1", LOSANGO], ["s1", SETA], ["t1", TEXTO]]);

function pontosDe(g: Gesto): { x: number; y: number }[] {
  return g.tipo === "traco" ? g.traco.pontos.map(([x, y]) => ({ x: g.traco.origem.x + x, y: g.traco.origem.y + y })) : [];
}
/** O ponto fica fora da peça (por onde o texto dela passa), com folga. */
function foraDaPeca(c: CaixaComPontos, p: { x: number; y: number }, folga = FOLGA_DA_MARCA - 1): boolean {
  const cx = c.x + c.largura / 2;
  const cy = c.y + c.altura / 2;
  if (c.forma === "elipse") return ((p.x - cx) / (c.largura / 2 + folga)) ** 2 + ((p.y - cy) / (c.altura / 2 + folga)) ** 2 >= 1;
  if (c.forma === "losango") return Math.abs(p.x - cx) / (c.largura / 2 + folga) + Math.abs(p.y - cy) / (c.altura / 2 + folga) >= 1;
  if (c.forma === "seta") return Math.abs(p.y - c.y) >= folga;
  // Texto: o sublinhado encosta na linha de base, sem entrar nela.
  const f = c.forma === "texto" ? 2 : folga;
  return p.x <= c.x - f || p.x >= c.x + c.largura + f || p.y <= c.y - f || p.y >= c.y + c.altura + f;
}

test("pergunta sobre uma elipse mostra um contorno em volta dela, não uma linha embaixo", () => {
  const [g] = comporGestos({ tipo: "sublinhar", alvo: "e1" }, ALVOS, area, 3);
  assert.equal(g.tipo, "traco");
  const pts = pontosDe(g);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  assert.ok(Math.min(...ys) < ELIPSE.y && Math.max(...ys) > ELIPSE.y + ELIPSE.altura, "passa por cima e por baixo");
  assert.ok(Math.min(...xs) < ELIPSE.x && Math.max(...xs) > ELIPSE.x + ELIPSE.largura, "e pelos dois lados");
  assert.ok(pts.every((p) => foraDaPeca(ELIPSE, p)));
});

test("nenhum gesto cruza a peça nos cinco tipos de alvo", () => {
  for (const [id, c] of ALVOS) {
    for (const tipo of ["marcar", "sublinhar", "circular", "enquadrar", "colchetes", "apontar"] as const) {
      for (const g of comporGestos({ tipo, alvo: id }, ALVOS, area, 7)) {
        for (const p of pontosDe(g)) assert.ok(foraDaPeca(c, p), `${tipo} em ${c.forma} passou por (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
      }
    }
  }
});

test("a forma decide o gesto: retângulo ganha um canto, texto um sublinhado colado, seta um realce ao lado", () => {
  const [ret] = comporGestos({ tipo: "marcar", alvo: "r1" }, ALVOS, area, 1);
  const pr = pontosDe(ret);
  assert.ok(pr.length >= 3 && pr.some((p) => p.y > RETANGULO.y + RETANGULO.altura) && pr.some((p) => p.x > RETANGULO.x + RETANGULO.largura));
  assert.ok(pr.every((p) => p.x > RETANGULO.x + RETANGULO.largura * 0.5), "contorno parcial, não a caixa inteira");
  const [txt] = comporGestos({ tipo: "marcar", alvo: "t1" }, ALVOS, area, 1);
  assert.ok(pontosDe(txt).every((p) => p.y > TEXTO.y + TEXTO.altura && p.y <= TEXTO.y + TEXTO.altura + 8), "colado na linha de base");
  const [seta] = comporGestos({ tipo: "marcar", alvo: "s1" }, ALVOS, area, 1);
  const ps = pontosDe(seta);
  assert.ok(ps.every((p) => p.x > 300 && p.x < 400), "fica no trecho do meio");
  for (const g of [ret, txt, seta]) assert.equal(g.tipo === "traco" && g.destaque, true, "marca é destaque temporário");
});

test("apontar deixa uma setinha que para perto da borda, sem cobrir a peça", () => {
  for (const [id, c] of ALVOS) {
    const [g, asas] = comporGestos({ tipo: "apontar", alvo: id }, ALVOS, area, 2);
    assert.ok(g.tipo === "traco" && g.destaque && asas?.tipo === "traco" && asas.destaque, `apontar em ${c.forma} vira haste e ponta temporárias`);
    const pts = pontosDe(g);
    const ponta = pts.at(-1)!;
    const cx = c.x + c.largura / 2;
    const cy = c.y + c.altura / 2;
    assert.ok(Math.hypot(ponta.x - cx, ponta.y - cy) < Math.hypot(pts[0].x - cx, pts[0].y - cy), "vem de fora em direção à peça");
  }
});

test("anotar e as letras do comparar ficam; o contorno do comparar é destaque", () => {
  const gestos = comporGestos({ tipo: "comparar", alvos: ["e1", "r1"] }, ALVOS, area, 1);
  assert.deepEqual(gestos.map((g) => g.tipo === "traco" ? `traco:${g.destaque}` : g.tipo), ["traco:true", "texto", "traco:true", "texto"]);
  const [nota] = comporGestos({ tipo: "anotar", alvo: "e1", texto: "Leitura ou escrita?" }, ALVOS, area, 1);
  assert.equal(nota.tipo, "texto");
});

test("garantirMarca pede marcar (a forma decide) e apontar já conta como marca", () => {
  assert.deepEqual(garantirMarca(undefined, ["e1"], 3), [{ tipo: "marcar", alvo: "e1" }]);
  assert.deepEqual(garantirMarca([{ tipo: "apontar", alvo: "e1" }], ["e1"]), [{ tipo: "apontar", alvo: "e1" }]);
  assert.deepEqual(garantirMarca([{ tipo: "anotar", texto: "?" }], ["e1"]), [{ tipo: "marcar", alvo: "e1" }, { tipo: "anotar", texto: "?" }]);
});

test("tipos do Excalidraw viram a forma do alvo", () => {
  assert.equal(formaDoElemento("ellipse"), "elipse");
  assert.equal(formaDoElemento("diamond"), "losango");
  assert.equal(formaDoElemento("freedraw"), "outra");
});
