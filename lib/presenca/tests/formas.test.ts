import assert from "node:assert/strict";
import { test } from "node:test";
import { circuloAMao, parteDoTraco, posicionarNota, setaAMao, type Traco } from "../formas";
import type { Caixa, Ponto } from "../tipos";

function absolutos(t: Traco): Ponto[] {
  return t.pontos.map(([x, y]) => ({ x: x + t.origem.x, y: y + t.origem.y }));
}

function comprimento(t: Traco): number {
  return t.pontos.slice(1).reduce((total, p, i) => total + Math.hypot(p[0] - t.pontos[i][0], p[1] - t.pontos[i][1]), 0);
}

function contem(poligono: Ponto[], p: Ponto): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

function sobrepoe(a: Caixa, b: Caixa): boolean {
  return a.x < b.x + b.largura && a.x + a.largura > b.x && a.y < b.y + b.altura && a.y + a.altura > b.y;
}

test("círculo envolve inclusive os cantos, com todos os pontos e segmentos fora da caixa", () => {
  const caixas = [
    { x: 100, y: 50, largura: 180, altura: 100 },
    { x: -100, y: -200, largura: 1000, altura: 10 },
    { x: 0, y: 0, largura: 10, altura: 1000 },
    { x: 5, y: 10, largura: 0, altura: 0 },
  ];
  for (const caixa of caixas) {
    for (const semente of [0, 1, 99, -23, 4294967295]) {
      const traco = circuloAMao(caixa, semente);
      assert.deepEqual(traco.pontos[0], [0, 0]);
      assert.ok(traco.pontos.length >= 48 && traco.pontos.length <= 64);
      const pontos = absolutos(traco);
      const fora = (p: Ponto) => p.x < caixa.x || p.x > caixa.x + caixa.largura || p.y < caixa.y || p.y > caixa.y + caixa.altura;
      pontos.forEach((p) => assert.ok(fora(p)));
      for (let i = 1; i < pontos.length; i++) {
        const a = pontos[i - 1];
        const b = pontos[i];
        for (const f of [0.25, 0.5, 0.75]) assert.ok(fora({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }));
      }
      for (const x of [caixa.x, caixa.x + caixa.largura]) {
        for (const y of [caixa.y, caixa.y + caixa.altura]) assert.ok(contem(pontos, { x, y }));
      }
    }
  }
});

test("círculo começa no alto à esquerda e avança no sentido horário mais 15 a 30 graus", () => {
  const caixa = { x: 0, y: 0, largura: 180, altura: 100 };
  const pontos = absolutos(circuloAMao(caixa, 3));
  assert.ok(pontos[0].x < 90 && pontos[0].y < 50);
  const angulos = pontos.map((p) => Math.atan2((p.y - 50) / (50 + 12), (p.x - 90) / (90 + 12)));
  let total = 0;
  for (let i = 1; i < angulos.length; i++) {
    const delta = (angulos[i] - angulos[i - 1] + 2 * Math.PI) % (2 * Math.PI);
    assert.ok(delta > 0 && delta < Math.PI);
    total += delta;
  }
  const extra = (total - 2 * Math.PI) * 180 / Math.PI;
  assert.ok(extra >= 15 && extra <= 30);
  assert.notDeepEqual(pontos[0], pontos.at(-1));
});

test("formas são determinísticas por semente e variam entre sementes", () => {
  const caixa = Object.freeze({ x: 0, y: 0, largura: 120, altura: 60 });
  const de = Object.freeze({ x: 10, y: 20 });
  const para = Object.freeze({ x: 140, y: 80 });
  assert.deepEqual(circuloAMao(caixa, 42), circuloAMao(caixa, 42));
  assert.notDeepEqual(circuloAMao(caixa, 42), circuloAMao(caixa, 43));
  assert.deepEqual(setaAMao(de, para, 42), setaAMao(de, para, 42));
  assert.notDeepEqual(setaAMao(de, para, 42), setaAMao(de, para, 43));
});

test("seta tem origem absoluta, pontos relativos e extremos exatos", () => {
  const de = { x: -20, y: 80 };
  const para = { x: 100, y: -20 };
  const seta = setaAMao(de, para, 8);
  assert.deepEqual(seta.origem, de);
  assert.deepEqual(seta.pontos[0], [0, 0]);
  assert.deepEqual(seta.pontos.at(-1), [120, -100]);
  assert.ok(seta.pontos.slice(1, -1).some(([x, y]) => Math.abs(x * -100 - y * 120) > 1));
  assert.deepEqual(setaAMao(de, de, 8), { origem: de, pontos: [[0, 0]] });
});

test("parte do traço interpola por distância e preserva o traço completo em 1", () => {
  const t: Traco = { origem: { x: 10, y: 20 }, pontos: [[0, 0], [2, 0], [2, 6]] };
  assert.deepEqual(parteDoTraco(t, 0), { origem: t.origem, pontos: [[0, 0]] });
  assert.deepEqual(parteDoTraco(t, 0.5), { origem: t.origem, pontos: [[0, 0], [2, 0], [2, 2]] });
  assert.deepEqual(parteDoTraco(t, 0.25).pontos, [[0, 0], [2, 0]]);
  assert.deepEqual(parteDoTraco(t, 1), t);
  assert.deepEqual(parteDoTraco(t, -1), parteDoTraco(t, 0));
  assert.deepEqual(parteDoTraco(t, 2), t);
  const circulo = circuloAMao({ x: 0, y: 0, largura: 200, altura: 80 }, 19);
  assert.ok(Math.abs(comprimento(parteDoTraco(circulo, 0.5)) - comprimento(circulo) / 2) < 1e-8);
});

test("recorte lida com pontos repetidos, traços vazios e de comprimento zero", () => {
  const origem = { x: 0, y: 0 };
  assert.deepEqual(parteDoTraco({ origem, pontos: [] }, 0.5), { origem, pontos: [] });
  assert.deepEqual(parteDoTraco({ origem, pontos: [[0, 0], [0, 0]] }, 0.5), { origem, pontos: [[0, 0]] });
  assert.deepEqual(parteDoTraco({ origem, pontos: [[0, 0], [0, 0], [10, 0], [10, 0]] }, 0.5).pontos, [[0, 0], [5, 0]]);
});

test("recortes e formas não compartilham referências mutáveis com as entradas", () => {
  const t: Traco = { origem: { x: 10, y: 20 }, pontos: [[0, 0], [10, 0]] };
  const copia = parteDoTraco(t, 1);
  copia.origem.x = -1;
  copia.pontos[0][0] = 100;
  assert.deepEqual(t, { origem: { x: 10, y: 20 }, pontos: [[0, 0], [10, 0]] });
});

test("nota prefere direita e muda para esquerda ou embaixo se necessário", () => {
  const area = { x: 0, y: 0, largura: 1000, altura: 700 };
  const tamanho = { largura: 180, altura: 100 };
  const alvos = [
    { x: 100, y: 100, largura: 100, altura: 80 },
    { x: 850, y: 100, largura: 100, altura: 80 },
    { x: 100, y: 100, largura: 800, altura: 80 },
  ];
  const resultados = alvos.map((a) => posicionarNota(a, tamanho, area));
  assert.equal(resultados[0].nota.x, 224);
  assert.equal(resultados[1].nota.x, 646);
  assert.equal(resultados[2].nota.y, 204);
  resultados.forEach((r, i) => {
    const nota = { ...r.nota, ...tamanho };
    assert.equal(sobrepoe(alvos[i], nota), false);
    assert.ok(nota.x >= area.x && nota.y >= area.y && nota.x + nota.largura <= 1000 && nota.y + nota.altura <= 700);
  });
});

test("nota ajusta o eixo transversal e seta liga bordas externas", () => {
  const alvo = { x: 100, y: 0, largura: 100, altura: 20 };
  const tamanho = { largura: 180, altura: 100 };
  const r = posicionarNota(alvo, tamanho, { x: 0, y: 0, largura: 1000, altura: 700 });
  assert.equal(r.nota.y, 0);
  assert.ok(r.setaDe.x >= 100 && r.setaDe.x <= 200);
  assert.ok(r.setaDe.x === 200 || r.setaDe.y === 0 || r.setaDe.y === 20);
  assert.equal(r.setaPara.x, r.nota.x);
  assert.ok(r.setaDe.y >= 0 && r.setaDe.y <= 20);
  assert.ok(r.setaPara.y >= 0 && r.setaPara.y <= 100);
});

test("sem espaço na vista, fallback não sobrepõe o alvo mesmo com nota maior que a vista", () => {
  const alvo = { x: 20, y: 20, largura: 100, altura: 60 };
  const tamanho = { largura: 400, altura: 300 };
  const r = posicionarNota(alvo, tamanho, { x: 0, y: 0, largura: 150, altura: 100 });
  assert.equal(r.nota.y, 104);
  assert.equal(sobrepoe(alvo, { ...r.nota, ...tamanho }), false);
  assert.ok(Number.isFinite(r.setaDe.x) && Number.isFinite(r.setaPara.y));
});

test("nota usa corretamente uma vista deslocada na cena e não altera argumentos", () => {
  const alvo = Object.freeze({ x: -450, y: 1000, largura: 100, altura: 60 });
  const tamanho = Object.freeze({ largura: 140, altura: 80 });
  const area = Object.freeze({ x: -500, y: 900, largura: 700, altura: 500 });
  const r = posicionarNota(alvo, tamanho, area);
  assert.equal(r.nota.x, -326);
  assert.ok(r.nota.y >= 900);
  assert.equal(sobrepoe(alvo, { ...r.nota, ...tamanho }), false);
});
