import assert from "node:assert/strict";
import { test } from "node:test";
import { liberouAPergunta } from "@/components/ide/useConversa";
import { grifoComProposito } from "@/lib/agents/interviewer";

test("pedido de licença: 'pode' abre a pergunta; 'espera' e 'agora não' deixam para depois", () => {
  for (const sim of ["pode", "pode falar", "sim, manda", "claro", "fala aí", "beleza, pode perguntar depois desse if"]) {
    assert.equal(liberouAPergunta(sim), true, sim);
  }
  for (const nao of ["espera um pouquinho", "agora não", "pera aí", "só um minuto", "não, deixa eu terminar", "daqui a pouco"]) {
    assert.equal(liberouAPergunta(nao), false, nao);
  }
});

const codigo = [
  "def is_valid(s):",
  "    pilha = []",
  "    pares = {')': '(', ']': '['}",
  "    for char in s:",
  "        if char in '([':",
  "            pilha.append(char)",
].join("\n");
const inicio = "def is_valid(s):\n    # escreva sua solução aqui\n    pass\n";

test("grifo com propósito: a fala cita algo das linhas grifadas", () => {
  assert.equal(grifoComProposito("Por que o dicionário pares mapeia o fechamento para a abertura?", codigo, { startLine: 3, endLine: 3 }, inicio), true);
  assert.equal(grifoComProposito("E essa linha, o que ela garante?", codigo, { startLine: 6, endLine: 6 }, inicio), true);
});

test("grifo sem propósito sai: fala que não fala das linhas, ou linhas só do código inicial", () => {
  assert.equal(grifoComProposito("Como você costuma dividir o tempo da entrevista?", codigo, { startLine: 1, endLine: 3 }, inicio), false);
  assert.equal(grifoComProposito("Como você pensa em resolver?", inicio, { startLine: 1, endLine: 3 }, inicio), false);
});
