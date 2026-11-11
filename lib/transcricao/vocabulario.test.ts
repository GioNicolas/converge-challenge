import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_TERMOS, normalizarTermos, termosDoLiveCoding, termosDoTitulo, TERMOS_RECRUTAMENTO } from "./vocabulario";
import { silencioParaCompletar, trechoPlausivel, urlDoScribe, VOZ_MINIMA_MS } from "../presenca/transcricao";

test("normalizarTermos tira repetidos e respeita 50 termos de até 20 caracteres", () => {
  assert.deepEqual(normalizarTermos(["Kafka", " kafka ", "", "um termo grande demais para o scribe"], ["Pilha"]), ["Kafka", "Pilha"]);
  const muitos = Array.from({ length: 80 }, (_, i) => `termo ${i}`);
  assert.equal(normalizarTermos(muitos).length, MAX_TERMOS);
  assert.ok(normalizarTermos(TERMOS_RECRUTAMENTO).every((t) => t.length <= 20));
});

test("termosDoTitulo pega o título e as palavras que importam", () => {
  // Título com mais de 20 caracteres não cabe no Scribe; ficam as palavras.
  assert.deepEqual(termosDoTitulo("Backend Pleno - Pagamentos"), ["Backend", "Pleno", "Pagamentos"]);
  assert.deepEqual(termosDoTitulo("SRE Sênior"), ["SRE Sênior", "SRE", "Sênior"]);
  assert.deepEqual(termosDoTitulo(""), []);
  assert.ok(!termosDoTitulo("Vaga de Dev Backend").some((t) => t === "Vaga" || t === "de"));
});

test("termosDoLiveCoding junta problema, linguagem e termos gerais, com os específicos primeiro", () => {
  const termos = termosDoLiveCoding({ problemaId: "two-sum", titulo: "Two Sum", linguagem: "python" });
  assert.equal(termos[0], "Two Sum");
  for (const t of ["dicionário de pares", "dict", "pilha", "hash map", "complexidade"]) assert.ok(termos.includes(t), t);
  assert.ok(termos.length <= MAX_TERMOS && termos.every((t) => t.length <= 20));
  assert.ok(termosDoLiveCoding({}).includes("complexidade"), "sem problema conhecido, ainda vai a lista geral");
});

test("urlDoScribe repete keyterms na URL do WebSocket", () => {
  const url = new URL(urlDoScribe("tk", ["two sum", "pilha", "Pilha"]));
  assert.deepEqual(url.searchParams.getAll("keyterms"), ["two sum", "pilha"]);
  assert.equal(new URL(urlDoScribe("tk")).searchParams.getAll("keyterms").length, 0);
});

test("trechoPlausivel barra frase longa com pouca voz e aceita fala curta", () => {
  assert.equal(trechoPlausivel("Eee 20. Tchau. Até mais, Fábio.", 400), false);
  assert.equal(trechoPlausivel("o que tu acha", 500), true);
  assert.equal(trechoPlausivel("sim", VOZ_MINIMA_MS - 1), false, "sem voz nenhuma, nem fala curta passa");
  assert.equal(trechoPlausivel("Eu usaria um dicionário de pares para guardar o complemento", 2000), true);
});

test("silencioParaCompletar completa o trecho até 2 s e não passa disso", () => {
  assert.equal(silencioParaCompletar(8000).length, 24000);
  assert.equal(silencioParaCompletar(40000).length, 0);
});
