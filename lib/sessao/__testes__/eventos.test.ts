import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { criarLinhaDoTempo, type EventoLinhaDoTempo } from "../eventos";

const andar = () => new Promise<void>((resolver) => setImmediate(resolver));
type Opcoes = Parameters<typeof criarLinhaDoTempo>[0];

function montar(t: TestContext, extra: Partial<Opcoes> = {}) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const lotes: EventoLinhaDoTempo[][] = [];
  let instante = 0;
  const linha = criarLinhaDoTempo({
    enviar: async (lote) => { lotes.push(lote); },
    agora: () => new Date(Date.UTC(2026, 0, 1, 0, 0, instante++)),
    ...extra,
  });
  t.after(() => linha.parar());
  return { linha, lotes };
}

function pendencia() {
  let resolver!: () => void;
  let rejeitar!: (erro: Error) => void;
  const promessa = new Promise<void>((resolve, reject) => {
    resolver = resolve;
    rejeitar = reject;
  });
  return { promessa, resolver, rejeitar };
}

test("registra horário ISO, tipos e dados em ordem e envia no intervalo padrão", async (t) => {
  const { linha, lotes } = montar(t);
  const tipos = ["desenho", "fala", "analise", "pergunta", "resposta", "fase"] as const;
  tipos.forEach((tipo, i) => linha.registrar(tipo, { numero: i }));
  t.mock.timers.tick(4999);
  await andar();
  assert.equal(lotes.length, 0);
  t.mock.timers.tick(1);
  await andar();
  assert.equal(lotes.length, 1);
  assert.deepEqual(lotes[0], tipos.map((tipo, i) => ({ horario: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), tipo, dados: { numero: i } })));
  t.mock.timers.tick(5000);
  await andar();
  assert.equal(lotes.length, 1);
});

test("o limite padrão de 50 envia sem esperar o temporizador", async (t) => {
  const { linha, lotes } = montar(t);
  for (let i = 0; i < 49; i++) linha.registrar("desenho", i);
  await andar();
  assert.equal(lotes.length, 0);
  linha.registrar("fase", 49);
  await andar();
  assert.equal(lotes.length, 1);
  assert.equal(lotes[0].length, 50);
  assert.deepEqual(lotes[0].map((e) => e.dados), Array.from({ length: 50 }, (_, i) => i));
});

test("intervalo e tamanho configuráveis dividem a fila em lotes limitados", async (t) => {
  const { linha, lotes } = montar(t, { intervaloMs: 100, maxLote: 2 });
  for (let i = 1; i <= 5; i++) linha.registrar("fala", i);
  await andar();
  assert.deepEqual(lotes.map((lote) => lote.map((e) => e.dados)), [[1, 2], [3, 4]]);
  t.mock.timers.tick(100);
  await andar();
  assert.deepEqual(lotes.map((lote) => lote.map((e) => e.dados)), [[1, 2], [3, 4], [5]]);
});

test("mantém um envio por vez mesmo quando chega outro ciclo e a fila cresce", async (t) => {
  const primeira = pendencia();
  const enviados: unknown[][] = [];
  let ativos = 0;
  let maxAtivos = 0;
  const { linha } = montar(t, {
    maxLote: 2,
    enviar: async (lote) => {
      enviados.push(lote.map((e) => e.dados));
      ativos++;
      maxAtivos = Math.max(maxAtivos, ativos);
      if (enviados.length === 1) await primeira.promessa;
      ativos--;
    },
  });
  linha.registrar("desenho", 1);
  linha.registrar("desenho", 2);
  await andar();
  for (let i = 3; i <= 7; i++) linha.registrar("fala", i);
  t.mock.timers.tick(15000);
  await andar();
  assert.deepEqual(enviados, [[1, 2]]);
  primeira.resolver();
  await andar();
  assert.deepEqual(enviados, [[1, 2], [3, 4], [5, 6], [7]]);
  assert.equal(maxAtivos, 1);
});

test("falha automática recoloca o lote à frente e só tenta de novo no próximo ciclo", async (t) => {
  const tentativas: unknown[][] = [];
  const entregues: unknown[] = [];
  const { linha } = montar(t, {
    maxLote: 2,
    enviar: async (lote) => {
      tentativas.push(lote.map((e) => e.dados));
      if (tentativas.length === 1) throw new Error("indisponível");
      entregues.push(...lote.map((e) => e.dados));
    },
  });
  linha.registrar("desenho", 1);
  linha.registrar("desenho", 2);
  await andar();
  linha.registrar("fala", 3);
  linha.registrar("fala", 4);
  await andar();
  t.mock.timers.tick(4999);
  await andar();
  assert.deepEqual(tentativas, [[1, 2]]);
  t.mock.timers.tick(1);
  await andar();
  assert.deepEqual(tentativas, [[1, 2], [1, 2], [3, 4]]);
  assert.deepEqual(entregues, [1, 2, 3, 4]);
});

test("falha durante envio mantém os eventos que chegaram depois, sem reordenar", async (t) => {
  const primeira = pendencia();
  const entregues: unknown[] = [];
  let chamadas = 0;
  const { linha } = montar(t, {
    maxLote: 2,
    enviar: async (lote) => {
      chamadas++;
      if (chamadas === 1) await primeira.promessa;
      entregues.push(...lote.map((e) => e.dados));
    },
  });
  linha.registrar("fala", 1);
  linha.registrar("fala", 2);
  await andar();
  linha.registrar("resposta", 3);
  primeira.rejeitar(new Error("rede"));
  await andar();
  assert.equal(chamadas, 1);
  t.mock.timers.tick(5000);
  await andar();
  assert.deepEqual(entregues, [1, 2, 3]);
});

test("descarregar espera o envio atual e envia inclusive o restante abaixo do limite", async (t) => {
  const primeira = pendencia();
  const enviados: unknown[][] = [];
  const { linha } = montar(t, {
    maxLote: 2,
    enviar: async (lote) => {
      enviados.push(lote.map((e) => e.dados));
      if (enviados.length === 1) await primeira.promessa;
    },
  });
  linha.registrar("fala", 1);
  linha.registrar("fala", 2);
  await andar();
  linha.registrar("fala", 3);
  let terminou = false;
  const descarga = linha.descarregar().then(() => { terminou = true; });
  await andar();
  assert.equal(terminou, false);
  assert.deepEqual(enviados, [[1, 2]]);
  primeira.resolver();
  await descarga;
  assert.equal(terminou, true);
  assert.deepEqual(enviados, [[1, 2], [3]]);
});

test("descargas simultâneas não duplicam eventos e fila vazia não envia lote", async (t) => {
  const { linha, lotes } = montar(t, { maxLote: 2 });
  await linha.descarregar();
  assert.equal(lotes.length, 0);
  linha.registrar("pergunta", 1);
  await Promise.all([linha.descarregar(), linha.descarregar(), linha.descarregar()]);
  assert.deepEqual(lotes.map((lote) => lote.map((e) => e.dados)), [[1]]);
});

test("erro de descarregar rejeita sem descartar eventos e permite repetição explícita", async (t) => {
  const erro = new Error("falhou");
  const entregues: unknown[] = [];
  let chamadas = 0;
  const { linha } = montar(t, {
    enviar: async (lote) => {
      chamadas++;
      if (chamadas === 1) throw erro;
      entregues.push(...lote.map((e) => e.dados));
    },
  });
  linha.registrar("fase", 1);
  await assert.rejects(linha.descarregar(), (e) => e === erro);
  assert.equal(chamadas, 1);
  await linha.descarregar();
  assert.deepEqual(entregues, [1]);
});

test("descarregar compartilha falha do envio já em andamento e mantém a fila", async (t) => {
  const primeira = pendencia();
  const entregues: unknown[] = [];
  let chamadas = 0;
  const { linha } = montar(t, {
    maxLote: 1,
    enviar: async (lote) => {
      chamadas++;
      if (chamadas === 1) await primeira.promessa;
      entregues.push(...lote.map((e) => e.dados));
    },
  });
  linha.registrar("fala", 1);
  await andar();
  linha.registrar("fala", 2);
  const descarga = linha.descarregar();
  primeira.rejeitar(new Error("rede"));
  await assert.rejects(descarga, /rede/);
  await linha.descarregar();
  assert.deepEqual(entregues, [1, 2]);
});

test("parar ignora registros, cancela ciclos e permite descarregar o que já estava na fila", async (t) => {
  const { linha, lotes } = montar(t);
  linha.registrar("fase", "antes");
  linha.parar();
  linha.parar();
  linha.registrar("fase", "depois");
  t.mock.timers.tick(20000);
  await andar();
  assert.equal(lotes.length, 0);
  await linha.descarregar();
  assert.deepEqual(lotes.map((lote) => lote.map((e) => e.dados)), [["antes"]]);
});

test("parar durante envio deixa concluir só o lote atual até a descarga explícita", async (t) => {
  const primeira = pendencia();
  const enviados: unknown[][] = [];
  const { linha } = montar(t, {
    maxLote: 1,
    enviar: async (lote) => {
      enviados.push(lote.map((e) => e.dados));
      if (enviados.length === 1) await primeira.promessa;
    },
  });
  linha.registrar("fase", 1);
  await andar();
  linha.registrar("fase", 2);
  linha.parar();
  primeira.resolver();
  await andar();
  assert.deepEqual(enviados, [[1]]);
  await linha.descarregar();
  assert.deepEqual(enviados, [[1], [2]]);
});

test("registrar durante enviar mantém a serialização sem reentrância", async (t) => {
  const entregues: unknown[] = [];
  const { linha } = montar(t, {
    maxLote: 1,
    enviar: async (lote) => {
      entregues.push(...lote.map((e) => e.dados));
      if (entregues.length === 1) linha.registrar("fase", 2);
    },
  });
  linha.registrar("fase", 1);
  await linha.descarregar();
  assert.deepEqual(entregues, [1, 2]);
});

test("opções inválidas são rejeitadas antes de criar o temporizador", () => {
  const enviar = async () => {};
  for (const maxLote of [0, -1, 1.5, Infinity, NaN]) assert.throws(() => criarLinhaDoTempo({ enviar, maxLote }), RangeError);
  for (const intervaloMs of [0, -1, Infinity, NaN]) assert.throws(() => criarLinhaDoTempo({ enviar, intervaloMs }), RangeError);
});

test("falha no segundo lote não reenvia o primeiro, já confirmado", async (t) => {
  const tentativas: unknown[][] = [];
  const entregues: unknown[] = [];
  const { linha } = montar(t, {
    maxLote: 2,
    enviar: async (lote) => {
      tentativas.push(lote.map((e) => e.dados));
      if (tentativas.length === 2) throw new Error("falha parcial");
      entregues.push(...lote.map((e) => e.dados));
    },
  });
  for (let i = 1; i <= 5; i++) linha.registrar("fala", i);
  await andar();
  assert.deepEqual(entregues, [1, 2]);
  t.mock.timers.tick(5000);
  await andar();
  assert.deepEqual(tentativas, [[1, 2], [3, 4], [3, 4], [5]]);
  assert.deepEqual(entregues, [1, 2, 3, 4, 5]);
});
