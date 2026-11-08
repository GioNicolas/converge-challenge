import assert from "node:assert/strict";
import { test } from "node:test";
import { FilaFalas } from "./filaFalas";

const andar = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

test("falas chegam ao agente em ordem, sem pedidos simultâneos", async () => {
  const recebidas: string[] = [];
  const fila = new FilaFalas(async (texto) => { recebidas.push(texto); }, () => assert.fail("sem erro esperado"));
  fila.adicionar("primeira");
  await andar();
  fila.adicionar("segunda");
  await andar();
  assert.deepEqual(recebidas, ["primeira", "segunda"]);
});

test("fala nova com um pedido em voo cancela o pedido e manda tudo junto", async () => {
  const recebidas: string[] = [];
  const canceladas: string[] = [];
  const fila = new FilaFalas((texto, sinal) => {
    recebidas.push(texto);
    if (recebidas.length > 1) return Promise.resolve();
    return new Promise<void>((_, rejeitar) => sinal.addEventListener("abort", () => { canceladas.push(texto); rejeitar(new Error("abort")); }));
  }, () => assert.fail("cancelar não é falha"));
  fila.adicionar("então eu acho que");
  fila.adicionar("o cache fica na frente");
  fila.adicionar("e quanto de leitura a gente tem?");
  await andar();
  assert.deepEqual(canceladas, ["então eu acho que"]);
  assert.deepEqual(recebidas, ["então eu acho que", "então eu acho que o cache fica na frente e quanto de leitura a gente tem?"]);
});

test("resposta pronta e ainda não ouvida é descartada e a fala vai inteira", async () => {
  const recebidas: string[] = [];
  let naoOuvida = true;
  let descartes = 0;
  const fila = new FilaFalas(async (texto) => { recebidas.push(texto); }, () => assert.fail("sem erro"), {
    respostaNaoOuvida: () => naoOuvida,
    descartarResposta: () => { descartes++; },
  });
  fila.adicionar("eu guardaria no banco");
  await andar();
  fila.adicionar("só a URL curta");
  await andar();
  assert.equal(descartes, 1);
  assert.deepEqual(recebidas, ["eu guardaria no banco", "eu guardaria no banco só a URL curta"]);
  // A resposta já foi ouvida: a fala seguinte vai sozinha.
  naoOuvida = false;
  fila.adicionar("e a original também");
  await andar();
  assert.deepEqual(recebidas.at(-1), "e a original também");
});

test("falha tenta de novo uma vez sozinha", async () => {
  let falhas = 1;
  const tentativas: string[] = [];
  const fila = new FilaFalas(async (texto) => {
    tentativas.push(texto);
    if (falhas-- > 0) throw new Error("503");
  }, () => assert.fail("o retry resolve"), { esperaDoRetryMs: 1 });
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
  }, (texto) => erros.push(texto), { esperaDoRetryMs: 1 });
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
