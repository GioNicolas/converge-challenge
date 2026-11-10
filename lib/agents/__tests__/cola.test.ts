// Colagem de código: toda colagem grande vira pergunta, garantida. Entrevista real de 2026-11-10 (sessão 972b2a10):
// o candidato colou da web uma solução diferente da que vinha escrevendo. A pergunta da análise sobre a colagem
// nasceu, mas outra pergunta estava aberta sem resposta; ele clicou em Finalizar 7 s depois e o encerramento
// perguntou do plano inicial, sem tocar na colagem.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideBlip, enqueueCola, enqueueKickoff, lastBlipDecision, startClosing } from "../policy";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";
import type { SessionState } from "@/lib/session/types";

const config = { ...DEFAULT_CONFIG, problemId: "climbing-stairs", durationMin: 15 };
const ANTES = "def climb_stairs(n):\n    um_por_um = n/2\n    if um_por_um%10 != 0:\n        um_por_um = int(um_por_um) + 1\n    pass\n";
const COLADO = [
  "def climb_stairs(n):",
  "    if n <= 2:",
  "        return n",
  "",
  "    anterior, atual = 1, 2  # formas de chegar aos degraus 1 e 2",
  "",
  "    for _ in range(3, n + 1):",
  "        anterior, atual = atual, anterior + atual",
  "",
  "    return atual",
  "",
].join("\n");

function sessao(nome: string): { s: SessionState; relogio: { agora: number } } {
  const s = getOrCreateSession(`${nome}-${Date.now()}-${Math.random()}`, config);
  const relogio = { agora: 0 };
  s.clock = () => relogio.agora;
  appendEvent(s, { type: "session_started", sessionId: s.sessionId, t: 0, configId: config.id, problemId: config.problemId, language: "python" });
  enqueueKickoff(s, 0);
  appendEvent(s, { type: "snapshot", sessionId: s.sessionId, t: 199_000, code: ANTES, version: 1, language: "python" });
  return { s, relogio };
}

function colar(s: SessionState, t: number, code = COLADO, lines = 10, startLine = 2) {
  appendEvent(s, { type: "snapshot", sessionId: s.sessionId, t, code, version: (s.codeHistory.at(-1)?.version ?? 0) + 1, language: "python" });
  const evento = { type: "paste" as const, sessionId: s.sessionId, t, chars: 220, lines, startLine };
  appendEvent(s, evento);
  return enqueueCola(s, evento);
}

test("colou um bloco: a pergunta entra na fila na hora, sabe o que havia antes e sai assim que ele tira a mão do teclado", () => {
  const { s } = sessao("cola");
  assert.equal(colar(s, 260_000), true);
  const q = s.queue.find((x) => x.kind === "cola")!;
  assert.equal(q.status, "queued");
  assert.equal(q.cola?.substituiu, true, "o bloco tomou o lugar do que ele vinha escrevendo");
  assert.match(q.cola?.antes ?? "", /um_por_um = n\/2/);
  assert.match(q.question, /diferente do que você vinha escrevendo/);
  assert.deepEqual(q.highlight, { startLine: 2, endLine: 11 });

  // No instante da colagem ele ainda está com a mão no teclado.
  assert.equal(decideBlip(s, 260_500).blip, undefined);
  assert.match(lastBlipDecision(s) ?? "", /pergunta da colagem/);
  // Dois segundos depois: sai, mesmo sem respiro, intervalo ou cota (a abertura que esperava cede o lugar).
  const blip = decideBlip(s, 262_000).blip;
  assert.equal(blip?.id, q.id);
  assert.equal(blip?.passaNaFrente, true);
  assert.equal(blip?.perdeAVez, undefined, "não perde a vez se ele falar: colou, tem que explicar");
  assert.equal(blip?.preview, "Quero entender o trecho que você colou");
  assert.equal(s.queue.find((x) => x.kickoff)?.status, "stale");
});

test("a pergunta da colagem passa na frente de um balão ainda não aberto e de um assunto aberto", () => {
  // Balão na tela, ainda não falado: sai da tela e dá lugar.
  const a = sessao("cola-balao").s;
  a.queue.find((x) => x.kickoff)!.status = "stale";
  a.queue.push({ id: "q-2", question: "O que esse if faz?", followUpTopic: "x", priority: 0.8, createdAt: 200_000, status: "blipped", kind: "explicar" });
  a.blips.push({ id: "q-2", preview: "x", priority: 0.8, createdAt: 205_000 });
  a.pendingBlipId = "q-2";
  colar(a, 260_000);
  const comBalao = decideBlip(a, 262_000);
  assert.equal(comBalao.dismissBlipId, "q-2");
  assert.equal(a.queue.find((x) => x.id === "q-2")?.status, "stale");
  assert.equal(a.queue.find((x) => x.id === comBalao.blip?.id)?.kind, "cola");

  // Assunto aberto (o Totti perguntou e espera a resposta): a da colagem sai assim mesmo, e a IDE fecha o outro.
  const b = sessao("cola-fio").s;
  b.queue.find((x) => x.kickoff)!.status = "stale";
  b.queue.push({ id: "q-2", question: "O que esse if faz?", followUpTopic: "x", priority: 0.8, createdAt: 200_000, status: "asked", kind: "explicar" });
  b.blips.push({ id: "q-2", preview: "x", priority: 0.8, createdAt: 205_000 });
  b.pendingBlipId = "q-2";
  colar(b, 260_000);
  const comFio = decideBlip(b, 262_000);
  assert.equal(b.queue.find((x) => x.id === comFio.blip?.id)?.kind, "cola");
  assert.equal(comFio.dismissBlipId, undefined);
  // O assunto antigo fecha depois: a pergunta da colagem continua sendo a da vez.
  appendEvent(b, { type: "blip_closed", sessionId: b.sessionId, t: 263_000, blipId: "q-2", reason: "agent" });
  assert.equal(b.pendingBlipId, comFio.blip?.id);
});

test("colou e clicou em Finalizar logo depois: o encerramento começa pela colagem e não repete o plano que ele já contou", () => {
  const { s } = sessao("cola-fim");
  s.evidence.push({ t: 149_000, criterionId: "abordagem", note: "planeja separar a contagem dividindo n por dois", source: "interviewer" });
  colar(s, 260_000);
  const blip = startClosing(s, 267_000);
  const fechamento = s.queue.find((x) => x.id === blip?.id)!;
  assert.equal(fechamento.kind, "encerramento");
  assert.match(fechamento.closingTopics![0], /^trecho colado \[linhas 2-11\]: ele colou 10 linhas de uma vez, no lugar do que vinha escrevendo,/);
  // O critério de abordagem, se entrar, leva o que ele já mostrou (era o "como você pensou antes de começar?").
  const abordagem = fechamento.closingTopics!.find((p) => p.startsWith("critério abordagem"));
  if (abordagem) assert.match(abordagem, /ele já mostrou: planeja separar a contagem dividindo n por dois/);
  assert.ok(fechamento.closingTopics!.length <= 2);
  // A colagem entrou no encerramento: não volta como pergunta solta.
  assert.equal(s.queue.find((x) => x.kind === "cola")?.status, "stale");
});

test("pergunta da colagem feita e sem resposta também entra no encerramento; respondida, não", () => {
  const { s } = sessao("cola-sem-resposta");
  colar(s, 260_000);
  const blip = decideBlip(s, 262_000).blip!;
  appendEvent(s, { type: "blip_opened", sessionId: s.sessionId, t: 263_000, blipId: blip.id });
  appendEvent(s, { type: "speech", sessionId: s.sessionId, t: 268_000, role: "agent", text: "De onde veio esse trecho?", blipId: blip.id });
  appendEvent(s, { type: "blip_closed", sessionId: s.sessionId, t: 300_000, blipId: blip.id, reason: "agent" });
  const semResposta = startClosing(s, 310_000);
  assert.match(s.queue.find((x) => x.id === semResposta?.id)?.closingTopics?.[0] ?? "", /^trecho colado/);

  const outra = sessao("cola-respondida").s;
  colar(outra, 260_000);
  const b = decideBlip(outra, 262_000).blip!;
  appendEvent(outra, { type: "blip_opened", sessionId: outra.sessionId, t: 263_000, blipId: b.id });
  appendEvent(outra, { type: "speech", sessionId: outra.sessionId, t: 275_000, role: "candidate", text: "peguei de um exemplo, ele soma os dois anteriores", blipId: b.id });
  appendEvent(outra, { type: "blip_closed", sessionId: outra.sessionId, t: 290_000, blipId: b.id, reason: "agent" });
  const fim = startClosing(outra, 310_000);
  assert.ok(!(outra.queue.find((x) => x.id === fim?.id)?.closingTopics ?? []).some((p) => p.startsWith("trecho colado")));
});

test("não é colagem para perguntar: bloco pequeno, código dele movido de lugar; e a pergunta some se ele apaga o trecho", () => {
  const { s } = sessao("cola-nao");
  // Três linhas: abaixo do mínimo.
  assert.equal(colar(s, 210_000, ANTES.replace("    pass\n", "    a = 1\n    b = 2\n    pass\n"), 3, 5), false);
  // Recortou e colou o próprio código mais abaixo: as linhas já existiam.
  const proprio = "def climb_stairs(n):\n    a = 1\n    b = 2\n    c = 3\n    d = 4\n    e = 5\n    f = 6\n    pass\n";
  appendEvent(s, { type: "snapshot", sessionId: s.sessionId, t: 220_000, code: proprio, version: 9, language: "python" });
  const movido = "def climb_stairs(n):\n    pass\n    a = 1\n    b = 2\n    c = 3\n    d = 4\n    e = 5\n    f = 6\n";
  assert.equal(colar(s, 230_000, movido, 6, 3), false);
  assert.equal(s.queue.some((x) => x.kind === "cola"), false);

  // Colou e apagou tudo antes de a pergunta sair: ela perde o sentido.
  assert.equal(colar(s, 240_000), true);
  appendEvent(s, { type: "snapshot", sessionId: s.sessionId, t: 243_000, code: ANTES, version: 20, language: "python" });
  assert.equal(decideBlip(s, 250_000).blip?.id === s.queue.find((x) => x.kind === "cola")?.id, false);
  assert.equal(s.queue.find((x) => x.kind === "cola")?.status, "stale");
});
