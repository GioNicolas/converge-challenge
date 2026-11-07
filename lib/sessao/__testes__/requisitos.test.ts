import { test } from "node:test";
import assert from "node:assert/strict";
import { adicionar, adicionarVarios, normalizar } from "../requisitos";

test("acrescenta no fim, mantendo a ordem de chegada", () => {
  const lista = adicionarVarios([], ["Guardar por 5 anos", "Código curto de 7 caracteres"]);
  assert.deepEqual(
    lista.map((r) => r.texto),
    ["Guardar por 5 anos", "Código curto de 7 caracteres"],
  );
});

test("ignora texto vazio ou só com espaços", () => {
  const lista = adicionar([], "Guardar por 5 anos");
  assert.equal(adicionar(lista, ""), lista);
  assert.equal(adicionar(lista, "   \n\t "), lista);
});

test("ignora repetido sem diferenciar maiúsculas, acentos e espaços", () => {
  const lista = adicionar([], "Código curto de 7 caracteres");
  assert.equal(adicionar(lista, "codigo CURTO  de 7 caracteres "), lista);
  assert.equal(adicionar(lista, "  Código curto de 7 caractéres"), lista);
  assert.equal(lista.length, 1);
});

test("guarda o texto limpo, sem espaços sobrando", () => {
  const [r] = adicionar([], "  Leitura   100x maior que escrita (~4 mil/s)  ");
  assert.equal(r.texto, "Leitura 100x maior que escrita (~4 mil/s)");
});

test("id é estável: o mesmo requisito tem o mesmo id, em qualquer posição", () => {
  const a = adicionarVarios([], ["Guardar por 5 anos", "100 milhões de URLs novas por mês"]);
  const b = adicionarVarios([], ["100 milhões de URLs novas por mês", "GUARDAR por 5 anos"]);
  assert.equal(a[0].id, b[1].id);
  assert.equal(a[1].id, b[0].id);
  assert.notEqual(a[0].id, a[1].id);
});

test("não altera a lista original", () => {
  const lista = adicionar([], "Guardar por 5 anos");
  const nova = adicionar(lista, "Código curto de 7 caracteres");
  assert.equal(lista.length, 1);
  assert.equal(nova.length, 2);
});

test("normalizar tira acentos, maiúsculas e espaços extras", () => {
  assert.equal(normalizar("  Açúcar   É  Bom "), "acucar e bom");
});
