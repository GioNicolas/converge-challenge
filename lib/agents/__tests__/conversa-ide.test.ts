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

test("pergunta de foco só no momento dela: pressão com falhas seguidas, escala e IA com a solução funcionando", async () => {
  const { focoPendente } = await import("@/lib/agents/focoQuota");
  const { getOrCreateSession, appendEvent } = await import("@/lib/session/store");
  const { DEFAULT_CONFIG } = await import("@/lib/config/default");
  const config = { ...DEFAULT_CONFIG, focus: [{ area: "pressao" as const, weight: 0.5 }, { area: "escala_produto" as const, weight: 0.3 }, { area: "uso_ia" as const, weight: 0.2 }] };
  const s = getOrCreateSession(`foco-${Date.now()}`, config);
  const id = s.sessionId;
  appendEvent(s, { type: "session_started", sessionId: id, t: 0, configId: config.id, problemId: config.problemId, language: "python" });
  appendEvent(s, { type: "snapshot", sessionId: id, t: 30_000, code: "def f(s):\n    return s", version: 1, language: "python" });
  // Logo depois de começar a codar: nenhum foco (era aqui que saía o "como você divide o seu tempo?").
  assert.equal(focoPendente(s, 40_000), undefined);
  const falhou = { passed: 0, total: 5, cases: [], stdout: "", stderr: "erro", durationMs: 1 };
  appendEvent(s, { type: "run", sessionId: id, t: 50_000, result: falhou });
  assert.equal(focoPendente(s, 51_000), undefined, "um erro só: ele ainda está olhando");
  appendEvent(s, { type: "run", sessionId: id, t: 60_000, result: falhou });
  assert.equal(focoPendente(s, 61_000), "pressao", "duas falhas seguidas");
  appendEvent(s, { type: "run", sessionId: id, t: 90_000, result: { ...falhou, passed: 5, stderr: "" } });
  assert.equal(focoPendente(s, 91_000), "escala_produto", "funcionou: pressão sai, entra o próximo foco do momento");
});
