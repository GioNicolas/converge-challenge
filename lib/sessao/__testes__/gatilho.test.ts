import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { criarGatilho, type OpcoesGatilho } from "../gatilho";
import type { PedidoAnalise, RespostaAnalise } from "../cliente";

const resposta: RespostaAnalise = {
  status: "ok",
  pergunta: null,
  nota: null,
  elementos: [],
  degrau: null,
  observacoes: [],
};

function pedido(n: number): PedidoAnalise {
  return {
    sessao_id: "s",
    fase: "APROFUNDAMENTO",
    grafo: `grafo ${n}`,
    mudancas: "",
    conversa_recente: [],
    perguntas_feitas: 0,
    imagem_url: null,
  };
}

/** Deixa as promessas pendentes andarem. */
const andar = () => new Promise<void>((r) => setImmediate(r));

function montar(extra: Partial<OpcoesGatilho> = {}) {
  let versaoDesenho = 0;
  const enviados: string[] = [];
  const resultados: string[] = [];
  const pendentes: (() => void)[] = [];
  const g = criarGatilho({
    pausaMs: 3_500,
    limiteMs: 8_000,
    podeAnalisar: () => true,
    montarPedido: () => pedido(versaoDesenho),
    analisar: (p) =>
      new Promise((resolver) => {
        enviados.push(p.grafo);
        pendentes.push(() => resolver(resposta));
      }),
    aoResultado: (_, p) => resultados.push(p.grafo),
    ...extra,
  });
  return {
    g,
    enviados,
    resultados,
    desenhar() {
      versaoDesenho++;
      g.mudou();
    },
    terminarAnalise: () => pendentes.shift()?.(),
  };
}

test("só dispara depois da pausa, e cada mudança reinicia a contagem", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const t = montar();
    t.desenhar();
    mock.timers.tick(3_000);
    t.desenhar();
    mock.timers.tick(3_000);
    assert.equal(t.enviados.length, 0);
    mock.timers.tick(500);
    assert.deepEqual(t.enviados, ["grafo 2"]);
  } finally {
    mock.timers.reset();
  }
});

test("o último vence: uma análise por vez, e só o pedido mais recente espera", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const t = montar();
    t.desenhar();
    mock.timers.tick(3_500); // análise 1 começa (grafo 1)
    t.desenhar();
    mock.timers.tick(3_500); // fica esperando
    t.desenhar();
    mock.timers.tick(3_500); // substitui a que esperava
    assert.deepEqual(t.enviados, ["grafo 1"]);

    t.terminarAnalise();
    await andar();
    // Só uma nova análise, já com o desenho mais recente.
    assert.deepEqual(t.enviados, ["grafo 1", "grafo 3"]);
    assert.deepEqual(t.resultados, ["grafo 1"]);
  } finally {
    mock.timers.reset();
  }
});

test("análise que passa do limite é ignorada", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const erros: unknown[] = [];
    const t = montar({ aoErro: (e) => erros.push(e) });
    t.desenhar();
    mock.timers.tick(3_500);
    mock.timers.tick(8_000);
    await andar();
    t.terminarAnalise(); // chega tarde
    await andar();
    assert.equal(t.resultados.length, 0);
    assert.equal(erros.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test("não analisa quando a fase não permite, nem quando nada mudou", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const bloqueado = montar({ podeAnalisar: () => false });
    bloqueado.desenhar();
    mock.timers.tick(3_500);
    assert.equal(bloqueado.enviados.length, 0);

    const semMudanca = montar({ montarPedido: (forcar) => (forcar ? pedido(0) : null) });
    semMudanca.desenhar();
    mock.timers.tick(3_500);
    assert.equal(semMudanca.enviados.length, 0);
    semMudanca.g.dispararAgora();
    assert.equal(semMudanca.enviados.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test("parar cancela a pausa em andamento", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const t = montar();
    t.desenhar();
    t.g.parar();
    mock.timers.tick(10_000);
    assert.equal(t.enviados.length, 0);
  } finally {
    mock.timers.reset();
  }
});
