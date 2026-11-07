import assert from "node:assert/strict";
import { test } from "node:test";
import { blocosDeLegenda, momentoDoTrecho, palavraEm, palavras, textoFaladoAte, type Alinhamento } from "../alinhamento";

function alinhar(texto: string): Alinhamento {
  const characters = Array.from(texto);
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => 1 + i * 0.1),
    character_end_times_seconds: characters.map((_, i) => 1.08 + i * 0.1),
  };
}

test("palavras preservam acentos e pontuação e ignoram espaços repetidos", () => {
  const a = alinhar("  Não,  ação!  ");
  assert.deepEqual(palavras(a), [
    { texto: "Não,", inicio: a.character_start_times_seconds[2], fim: a.character_end_times_seconds[5], indiceInicial: 2 },
    { texto: "ação!", inicio: a.character_start_times_seconds[8], fim: a.character_end_times_seconds[12], indiceInicial: 8 },
  ]);
});

test("tabulações e quebras de linha também separam palavras", () => {
  const a = alinhar("não\t\nação\r\nagora.");
  assert.deepEqual(palavras(a).map((p) => p.texto), ["não", "ação", "agora."]);
});

test("legenda progressiva revela cada caractere no início e preserva o texto original", () => {
  const a = alinhar("Não,  ação!");
  assert.equal(textoFaladoAte(a, 0), "");
  assert.equal(textoFaladoAte(a, 1), "N");
  assert.equal(textoFaladoAte(a, 1.05), "N");
  assert.equal(textoFaladoAte(a, a.character_start_times_seconds[3]), "Não,");
  assert.equal(textoFaladoAte(a, a.character_start_times_seconds[6]), "Não,  a");
  assert.equal(textoFaladoAte(a, 100), "Não,  ação!");
});

test("palavra ativa considera pausas, início inclusivo e fim exclusivo", () => {
  const a = alinhar("não  ação");
  const [primeira, segunda] = palavras(a);
  assert.equal(palavraEm(a, 0), -1);
  assert.equal(palavraEm(a, primeira.inicio), 0);
  assert.equal(palavraEm(a, primeira.fim - 0.001), 0);
  assert.equal(palavraEm(a, primeira.fim), -1);
  assert.equal(palavraEm(a, (primeira.fim + segunda.inicio) / 2), -1);
  assert.equal(palavraEm(a, segunda.inicio), 1);
  assert.equal(palavraEm(a, segunda.fim), -1);
  assert.equal(palavraEm(a, 100), -1);
});

test("busca ignora acentos, maiúsculas e pontuação, devolvendo o instante original", () => {
  const a = alinhar("Onde fica o gargalo? Não, ação!");
  const indice = a.characters.join("").indexOf("gargalo");
  const acao = a.characters.join("").indexOf("ação");
  assert.equal(momentoDoTrecho(a, "GÁRGALO!"), a.character_start_times_seconds[indice]);
  assert.equal(momentoDoTrecho(a, "acao"), a.character_start_times_seconds[acao]);
  assert.equal(momentoDoTrecho(a, "NÃO ACAO"), a.character_start_times_seconds[a.characters.indexOf("N")]);
  assert.equal(momentoDoTrecho(a, "ONDE    fica"), a.character_start_times_seconds[0]);
  assert.equal(momentoDoTrecho(a, "inexistente"), null);
  assert.equal(momentoDoTrecho(a, ""), null);
  assert.equal(momentoDoTrecho(a, "?! …"), null);
});

test("busca preserva índices após emoji, acentos combinados e pontuação entre letras", () => {
  const a = alinhar("🤔 AÇÃO e A.P.I. e na\u0303o");
  assert.equal(momentoDoTrecho(a, "ação"), a.character_start_times_seconds[2]);
  const api = a.characters.findIndex((c, i) => c === "A" && a.characters[i + 1] === ".");
  assert.equal(momentoDoTrecho(a, "api"), a.character_start_times_seconds[api]);
  const nao = a.characters.indexOf("n");
  assert.equal(momentoDoTrecho(a, "NÃO"), a.character_start_times_seconds[nao]);
});

test("busca retorna a primeira ocorrência e não une palavras separadas por espaços", () => {
  const a = alinhar("ação ação; a cão");
  assert.equal(momentoDoTrecho(a, "ação"), 1);
  assert.equal(momentoDoTrecho(alinhar("a cão"), "ação"), null);
});

test("blocos respeitam limite, pontuação e horários sem cortar palavras", () => {
  const a = alinhar("não,  ação! sim.");
  const p = palavras(a);
  assert.deepEqual(blocosDeLegenda(a, 10), [
    { texto: "não, ação!", inicio: p[0].inicio, fim: p[1].fim },
    { texto: "sim.", inicio: p[2].inicio, fim: p[2].fim },
  ]);
  assert.deepEqual(blocosDeLegenda(a, 5).map((b) => b.texto), ["não,", "ação!", "sim."]);
});

test("limite padrão de 84 mantém o texto em blocos completos", () => {
  const texto = "Onde fica o gargalo? A ação precisa considerar o caminho entre o cliente e o banco, além da fila de tarefas e dos trabalhadores.";
  const a = alinhar(texto);
  const blocos = blocosDeLegenda(a);
  assert.ok(blocos.length > 1);
  assert.ok(blocos.every((b) => b.texto.length <= 84));
  assert.equal(blocos.map((b) => b.texto).join(" "), texto);
  assert.deepEqual(blocos.flatMap((b) => b.texto.split(" ")), palavras(a).map((p) => p.texto));
  assert.equal(blocos[0].inicio, palavras(a)[0].inicio);
  assert.equal(blocos.at(-1)?.fim, palavras(a).at(-1)?.fim);
});

test("limite impossível é rejeitado sem cortar uma palavra", () => {
  assert.throws(() => blocosDeLegenda(alinhar("ação"), 3), RangeError);
  for (const limite of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => blocosDeLegenda(alinhar("sim"), limite), RangeError);
  assert.deepEqual(blocosDeLegenda(alinhar("ação"), 4).map((b) => b.texto), ["ação"]);
});

test("alinhamento vazio e texto só de espaços não produzem palavras ou blocos", () => {
  for (const texto of ["", " \t\n  "]) {
    const a = alinhar(texto);
    assert.deepEqual(palavras(a), []);
    assert.deepEqual(blocosDeLegenda(a), []);
    assert.equal(palavraEm(a, 10), -1);
    assert.equal(momentoDoTrecho(a, "ação"), null);
    assert.equal(textoFaladoAte(a, 0), "");
    assert.equal(textoFaladoAte(a, 100), texto);
  }
});

test("funções não alteram o alinhamento nem dependem da ordem das consultas", () => {
  const a = alinhar("Não, ação!");
  const original = JSON.stringify(a);
  Object.freeze(a.characters);
  Object.freeze(a.character_start_times_seconds);
  Object.freeze(a.character_end_times_seconds);
  Object.freeze(a);
  const antes = palavras(a);
  textoFaladoAte(a, 1.4);
  momentoDoTrecho(a, "ação");
  palavraEm(a, 1.2);
  blocosDeLegenda(a, 10);
  assert.deepEqual(palavras(a), antes);
  assert.equal(JSON.stringify(a), original);
});
