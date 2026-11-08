import assert from "node:assert/strict";
import { test } from "node:test";
import { FilaFalas } from "./filaFalas";

const andar = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

test("falas chegam ao agente em ordem, sem pedidos simultâneos", async () => {
  const recebidas: string[] = [];
  let liberar: (() => void) | undefined;
  const fila = new FilaFalas(async (texto) => {
    recebidas.push(texto);
    if (texto === "primeira") await new Promise<void>((resolve) => { liberar = resolve; });
  }, () => assert.fail("sem erro esperado"));
  fila.adicionar("primeira");
  fila.adicionar("segunda");
  assert.deepEqual(recebidas, ["primeira"]);
  liberar?.();
  await andar();
  assert.deepEqual(recebidas, ["primeira", "segunda"]);
});

test("pedaços que chegam com um pedido em voo viram uma fala só", async () => {
  const recebidas: string[] = [];
  let liberar: (() => void) | undefined;
  const fila = new FilaFalas(async (texto) => {
    recebidas.push(texto);
    if (recebidas.length === 1) await new Promise<void>((resolve) => { liberar = resolve; });
  }, () => assert.fail("sem erro esperado"));
  fila.adicionar("então eu acho que");
  fila.adicionar("o cache fica na frente");
  fila.adicionar("e quanto de leitura a gente tem?");
  liberar?.();
  await andar();
  assert.deepEqual(recebidas, ["então eu acho que", "o cache fica na frente e quanto de leitura a gente tem?"]);
});

test("falha tenta de novo uma vez sozinha", async () => {
  let falhas = 1;
  const tentativas: string[] = [];
  const fila = new FilaFalas(async (texto) => {
    tentativas.push(texto);
    if (falhas-- > 0) throw new Error("503");
  }, () => assert.fail("o retry resolve"), 1);
  fila.adicionar("sim");
  await andar();
  assert.deepEqual(tentativas, ["sim", "sim"]);
});

test("falha duas vezes: avisa e segue com as próximas falas (não trava a conversa)", async () => {
  let falhar = true;
  const tentativas: string[] = [];
  const erros: string[] = [];
  const fila = new FilaFalas(async (texto) => {
    tentativas.push(texto);
    if (falhar) throw new Error("rede");
  }, (texto) => erros.push(texto), 1);
  fila.adicionar("sim");
  await andar();
  assert.deepEqual(erros, ["sim"]);
  falhar = false;
  fila.adicionar("e também Python");
  await andar();
  assert.deepEqual(tentativas, ["sim", "sim", "e também Python"]);
  fila.tentarNovamente();
  await andar();
  assert.deepEqual(tentativas.at(-1), "sim");
});

test("encerrar descarta falas pendentes mesmo se o pedido anterior resolver depois", async () => {
  let liberar: (() => void) | undefined;
  const recebidas: string[] = [];
  const fila = new FilaFalas(async (texto) => {
    recebidas.push(texto);
    await new Promise<void>((resolve) => { liberar = resolve; });
  }, () => {});
  fila.adicionar("em andamento");
  fila.adicionar("descartar");
  fila.limpar();
  liberar?.();
  await andar();
  assert.deepEqual(recebidas, ["em andamento"]);
});
