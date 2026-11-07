import assert from "node:assert/strict";
import { test } from "node:test";
import { planejarMovimento, suavizar } from "../movimento";

test("movimento começa e termina exatamente nos pontos pedidos, em qualquer direção", () => {
  const de = { x: -35, y: 20 };
  for (const para of [{ x: 0, y: 0 }, { x: 1000, y: 600 }, { x: -500, y: -300 }, de]) {
    const m = planejarMovimento(de, para, 123);
    assert.deepEqual(m.pontoEm(0), de);
    assert.deepEqual(m.pontoEm(1), para);
    assert.deepEqual(m.pontoEm(-1), de);
    assert.deepEqual(m.pontoEm(2), para);
  }
});

test("duração cresce segundo a distância e respeita 250 a 1100 ms", () => {
  const duracoes = [0, 10, 100, 500, 1000, 1000000].map((d) => planejarMovimento({ x: 0, y: 0 }, { x: d, y: 0 }, 1).duracaoMs);
  assert.equal(duracoes[0], 250);
  assert.equal(duracoes.at(-1), 1100);
  for (let i = 1; i < duracoes.length; i++) {
    assert.ok(duracoes[i] > duracoes[i - 1]);
    assert.ok(duracoes[i] >= 250 && duracoes[i] <= 1100);
  }
  assert.equal(duracoes[2], Math.round(250 + 140 * Math.log2(1 + 100 / 40)));
});

test("só deslocamentos maiores que 150 passam do alvo, entre 3 e 6%", () => {
  for (const distancia of [1, 100, 150, 151, 1000]) {
    const de = { x: 30, y: -20 };
    const ux = 0.6;
    const uy = 0.8;
    const m = planejarMovimento(de, { x: de.x + ux * distancia, y: de.y + uy * distancia }, 23);
    const projecoes = Array.from({ length: 1001 }, (_, i) => {
      const p = m.pontoEm(i / 1000);
      return (p.x - de.x) * ux + (p.y - de.y) * uy;
    });
    const maximo = Math.max(...projecoes);
    if (distancia <= 150) assert.ok(maximo <= distancia + 1e-8);
    else assert.ok(maximo >= distancia * 1.03 && maximo <= distancia * 1.06 + 1e-8);
  }
});

test("o caminho é curvo e a mesma semente dá a mesma trajetória em qualquer ordem de avaliação", () => {
  const de = { x: 0, y: 0 };
  const para = { x: 100, y: 0 };
  const a = planejarMovimento(de, para, 7);
  const b = planejarMovimento(de, para, 7);
  assert.ok(Math.abs(a.pontoEm(0.5).y) > 2);
  for (const t of [0.5, 0.1, 0.8, 0.5, 0.2, 1]) assert.deepEqual(a.pontoEm(t), b.pontoEm(t));
  assert.notDeepEqual(a.pontoEm(0.5), planejarMovimento(de, para, 8).pontoEm(0.5));
});

test("suavização é monotônica, acelera e freia, com pontas estáveis", () => {
  assert.equal(suavizar(0), 0);
  assert.equal(suavizar(1), 1);
  assert.equal(suavizar(0.5), 0.5);
  assert.equal(suavizar(-1), 0);
  assert.equal(suavizar(2), 1);
  let anterior = 0;
  for (let i = 0; i <= 100; i++) {
    const atual = suavizar(i / 100);
    assert.ok(atual >= anterior && atual <= 1);
    anterior = atual;
  }
  const m = planejarMovimento({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
  const inicio = m.pontoEm(0.01).x;
  const meio = m.pontoEm(0.51).x - m.pontoEm(0.5).x;
  const fim = 100 - m.pontoEm(0.99).x;
  assert.ok(inicio < meio / 10 && fim < meio / 10);
});

test("não há salto no começo do retorno nem tremor em movimento nulo", () => {
  const m = planejarMovimento({ x: 0, y: 0 }, { x: 1000, y: 0 }, 8);
  const a = m.pontoEm(0.82 - 1e-7);
  const b = m.pontoEm(0.82 + 1e-7);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
  const parado = planejarMovimento({ x: 20, y: 30 }, { x: 20, y: 30 }, 8);
  for (const t of [0, 0.2, 0.5, 0.9, 1]) assert.deepEqual(parado.pontoEm(t), { x: 20, y: 30 });
});

test("o plano captura coordenadas sem alterar ou reter objetos mutáveis de entrada", () => {
  const de = { x: 0, y: 0 };
  const para = { x: 500, y: 300 };
  const m = planejarMovimento(de, para, 55);
  const antes = m.pontoEm(0.4);
  de.x = 100;
  para.y = -10;
  m.pontoEm(0).x = -100;
  assert.deepEqual(m.pontoEm(0.4), antes);
  assert.deepEqual(m.pontoEm(0), { x: 0, y: 0 });
  assert.deepEqual(m.pontoEm(1), { x: 500, y: 300 });
});
