import assert from "node:assert/strict";
import { test } from "node:test";
import { montarFalaDoDesafio } from "../falaDoDesafio";

const problema = { titulo: "Encurtador de URL", enunciado: "Projete um serviço como o bit.ly." };

test("usa a fala natural do cérebro, aparada, em vez de ler o enunciado", () => {
  const fala = montarFalaDoDesafio({ ...problema, fala_do_desafio: "  Hoje a conversa é sobre links.  " });
  assert.equal(fala, "Hoje a conversa é sobre links.");
  assert.ok(!fala.includes(problema.enunciado));
});

test("sem fala natural (ou em branco), monta uma do título e do enunciado", () => {
  for (const fala_do_desafio of [undefined, "", "   "]) {
    const fala = montarFalaDoDesafio({ ...problema, fala_do_desafio });
    assert.ok(fala.includes(problema.titulo));
    assert.ok(fala.includes(problema.enunciado));
  }
});
