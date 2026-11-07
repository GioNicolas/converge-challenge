import assert from "node:assert/strict";
import { test } from "node:test";
import encurtador from "../fixtures/encurtador.json";
import { criarConversor } from "../conversor";
import { descreverMudancas } from "../diff";
import type { ExcalidrawElement } from "../tipos";

const modelos = encurtador as unknown as readonly ExcalidrawElement[];
const base = modelos.find((e) => e.type === "rectangle")!;
const baseTexto = modelos.find((e) => e.type === "text") as Extract<ExcalidrawElement, { type: "text" }>;
const baseSeta = modelos.find((e) => e.type === "arrow") as Extract<ExcalidrawElement, { type: "arrow" | "line" }>;

function forma(id: string, tipo: "rectangle" | "ellipse" | "diamond", x = 0, y = 0, width = 200, height = 100): ExcalidrawElement {
  return { ...base, id, type: tipo, x, y, width, height };
}

function texto(id: string, valor: string, cx: number, cy: number, containerId: string | null = null): ExcalidrawElement {
  return { ...baseTexto, id, text: valor, originalText: valor, x: cx - 20, y: cy - 10, width: 40, height: 20, containerId };
}

function seta(id: string, pontos: [number, number][] = [[0, 0], [200, 0]]): ExcalidrawElement {
  return { ...baseSeta, id, x: 0, y: 0, points: pontos as typeof baseSeta.points, startBinding: null, endBinding: null };
}

test("texto solto no centro da elipse vira nome sem ID próprio nem pedido de imagem", () => {
  const conversor = criarConversor();
  const atual = conversor.converter([forma("api", "ellipse"), texto("nome", "API", 100, 50)]);
  assert.equal(atual.instantaneo.componentes[0].nome, "API");
  assert.equal(atual.instantaneo.anotacoes.length, 0);
  assert.equal(conversor.idCurto("nome"), undefined);
  assert.equal(atual.precisaImagem, false);
  assert.match(atual.texto, /\[e1\] API \(elipse\)/);
  assert.doesNotMatch(atual.texto, /ANOTAÇÕES SOLTAS/);
});

test("menor forma aninhada recebe o texto, mesmo vindo depois no array", () => {
  const atual = criarConversor().converter([
    forma("maior", "rectangle", 0, 0, 400, 300), texto("nome", "Worker", 100, 100),
    forma("menor", "rectangle", 50, 50, 100, 100),
  ]);
  assert.equal(atual.instantaneo.componentes[0].nome, "");
  assert.equal(atual.instantaneo.componentes[1].nome, "Worker");
  assert.equal(atual.instantaneo.componentes[1].dentroDe, "r1");
  assert.equal(atual.instantaneo.anotacoes.length, 0);
});

test("texto vinculado tem prioridade e texto solto dentro permanece anotação com contenção", () => {
  const atual = criarConversor().converter([
    forma("banco", "ellipse"), texto("vinculado", "Postgres", 100, 40, "banco"),
    texto("nota", "100 mil/s", 100, 65),
  ]);
  assert.equal(atual.instantaneo.componentes[0].nome, "Postgres");
  assert.deepEqual(atual.instantaneo.anotacoes, [{ id: "t1", texto: "100 mil/s", dentroDe: "e1" }]);
  assert.match(atual.texto, /\[t1\] "100 mil\/s"  dentro de \[e1\] Postgres/);
  assert.match(descreverMudancas(null, atual.instantaneo), /\+ anotou \[t1\] "100 mil\/s" dentro de \[e1\] Postgres/);
});

test("cantos do retângulo envolvente não contam como interior de elipse ou losango", () => {
  for (const tipo of ["ellipse", "diamond"] as const) {
    const atual = criarConversor().converter([forma("forma", tipo), texto("nota", "fora", 10, 10)]);
    assert.equal(atual.instantaneo.componentes[0].nome, "");
    assert.equal(atual.instantaneo.anotacoes[0].texto, "fora");
    assert.equal(atual.instantaneo.anotacoes[0].dentroDe, null);
  }
});

test("contenção do texto respeita rotação da forma", () => {
  const elipse = { ...forma("forma", "ellipse"), angle: Math.PI / 2 } as ExcalidrawElement;
  const atual = criarConversor().converter([elipse, texto("nome", "API", 100, 130)]);
  assert.equal(atual.instantaneo.componentes[0].nome, "API");
});

test("texto próximo ao meio da seta vira rótulo e não recebe ID", () => {
  const conversor = criarConversor();
  const atual = conversor.converter([seta("seta"), texto("rotulo", "lê e grava", 100, 20)]);
  assert.equal(atual.instantaneo.conexoes[0].rotulo, "lê e grava");
  assert.equal(atual.instantaneo.anotacoes.length, 0);
  assert.equal(conversor.idCurto("rotulo"), undefined);
  assert.match(atual.texto, /\[s1\] \? → \? \("lê e grava"\)/);
});

test("rótulo considera o comprimento da polilinha, sem aproximar por extremos", () => {
  const atual = criarConversor().converter([
    seta("curva", [[0, 0], [20, 0], [20, 180]]), texto("rotulo", "fila", 40, 80),
  ]);
  assert.equal(atual.instantaneo.conexoes[0].rotulo, "fila");
  const pertoDaPonta = criarConversor().converter([seta("reta"), texto("nota", "nota", 10, 20)]);
  assert.equal(pertoDaPonta.instantaneo.conexoes[0].rotulo, "");
  assert.equal(pertoDaPonta.instantaneo.anotacoes.length, 1);
});

test("limiares de 30 px e 20 a 80% são inclusivos", () => {
  for (const cx of [40, 160]) {
    const dentro = criarConversor().converter([seta("s"), texto("t", "rótulo", cx, 30)]);
    assert.equal(dentro.instantaneo.conexoes[0].rotulo, "rótulo");
  }
  for (const [cx, cy] of [[39.9, 20], [160.1, 20], [100, 30.1]]) {
    const fora = criarConversor().converter([seta("s"), texto("t", "nota", cx, cy)]);
    assert.equal(fora.instantaneo.conexoes[0].rotulo, "");
    assert.equal(fora.instantaneo.anotacoes.length, 1);
  }
});

test("rótulo vinculado vence; texto longe e seta degenerada não absorvem notas", () => {
  const atual = criarConversor().converter([
    seta("s"), texto("v", "vinculado", 100, 0, "s"), texto("perto", "nota", 100, 20),
    texto("longe", "distante", 800, 800), seta("zero", [[0, 0], [0, 0]]),
  ]);
  assert.equal(atual.instantaneo.conexoes[0].rotulo, "vinculado");
  assert.deepEqual(atual.instantaneo.anotacoes.map((a) => a.texto), ["nota", "distante"]);
});

test("forma tem prioridade sobre seta e textos ignorados não nomeiam nem rotulam", () => {
  const dentro = criarConversor().converter([seta("s"), forma("f", "rectangle", 50, -50, 100, 100), texto("t", "API", 100, 0)]);
  assert.equal(dentro.instantaneo.componentes[0].nome, "API");
  assert.equal(dentro.instantaneo.conexoes[0].rotulo, "");
  const ignorado = { ...texto("ignorado", "oculto", 100, 0), customData: { autor: "agente" } };
  const atual = criarConversor().converter([seta("s"), forma("f", "ellipse", 50, -50, 100, 100), ignorado]);
  assert.equal(atual.instantaneo.componentes[0].nome, "");
  assert.equal(atual.instantaneo.conexoes[0].rotulo, "");
  assert.equal(atual.instantaneo.anotacoes.length, 0);
});

test("arrastar nome para fora renomeia a forma e adiciona anotação; voltar preserva IDs históricos", () => {
  const conversor = criarConversor();
  const f = forma("f", "ellipse");
  const dentro = conversor.converter([f, texto("t", "API", 100, 50)]).instantaneo;
  const fora = conversor.converter([f, texto("t", "API", 500, 500)]).instantaneo;
  assert.equal(descreverMudancas(dentro, fora), '~ renomeou [e1] API → (sem texto)\n+ anotou [t1] "API"');
  const voltou = conversor.converter([f, texto("t", "API", 100, 50)]).instantaneo;
  assert.equal(descreverMudancas(fora, voltou), '~ renomeou [e1] (sem texto) → API\n- apagou a anotação [t1]');
  conversor.converter([f, texto("t", "API", 500, 500)]);
  assert.equal(conversor.idCurto("t"), "t1");
});

test("mover anotação para fora de forma nomeada gera mudança de contenção", () => {
  const conversor = criarConversor();
  const base = [forma("f", "ellipse"), texto("v", "Postgres", 100, 50, "f")];
  const dentro = conversor.converter([...base, texto("t", "100 mil/s", 100, 70)]).instantaneo;
  const fora = conversor.converter([...base, texto("t", "100 mil/s", 500, 500)]).instantaneo;
  assert.equal(descreverMudancas(dentro, fora), "~ moveu a anotação [t1] para fora de [e1] Postgres");
});

test("vários textos absorvidos compõem o nome em ordem do array", () => {
  const atual = criarConversor().converter([forma("f", "rectangle"), texto("t1", "API", 80, 40), texto("t2", "de criação", 120, 65)]);
  assert.equal(atual.instantaneo.componentes[0].nome, "API de criação");
  assert.equal(atual.instantaneo.anotacoes.length, 0);
});

test("bindings em textos absorvidos continuam conectando sua forma", () => {
  const linha = { ...seta("s"), startBinding: { elementId: "nome", focus: 0, gap: 0 } } as ExcalidrawElement;
  const atual = criarConversor().converter([forma("f", "ellipse"), texto("nome", "API", 100, 50), linha]);
  assert.equal(atual.instantaneo.conexoes[0].de, "e1");
  assert.match(atual.texto, /\[s1\] API →/);
});

test("seta mais próxima com rótulo vinculado preserva a nota, mesmo com outra seta perto", () => {
  const outra = { ...seta("outra"), y: 25 };
  const atual = criarConversor().converter([seta("s"), texto("v", "original", 100, 0, "s"), outra, texto("nota", "anotação", 100, 5)]);
  assert.equal(atual.instantaneo.conexoes[0].rotulo, "original");
  assert.equal(atual.instantaneo.conexoes[1].rotulo, "");
  assert.equal(atual.instantaneo.anotacoes[0].texto, "anotação");
});
