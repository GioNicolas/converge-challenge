import assert from "node:assert/strict";
import { test } from "node:test";
import { FilaFalas } from "./filaFalas";

const andar = () => new Promise<void>((resolve) => setImmediate(resolve));

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

test("falha preserva a fala e pausa as seguintes até tentar novamente", async () => {
  let falhar = true;
  const tentativas: string[] = [];
  const erros: string[] = [];
  const fila = new FilaFalas(async (texto) => {
    tentativas.push(texto);
    if (falhar) throw new Error("rede");
  }, (texto) => erros.push(texto));
  fila.adicionar("sim");
  await andar();
  fila.adicionar("e também Python");
  assert.deepEqual(tentativas, ["sim"]);
  assert.deepEqual(erros, ["sim"]);
  falhar = false;
  fila.tentarNovamente();
  await andar();
  assert.deepEqual(tentativas, ["sim", "sim", "e também Python"]);
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
