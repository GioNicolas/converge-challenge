// Conversa natural na IDE: o entrevistador só ouve quem pensa em voz alta, avança quando a etapa termina
// e não repete as falas de reserva. O provedor do LLM é simulado pelo fetch.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { falaNaoRepetida, runInterviewerTurn } from "../interviewer";
import { buildInterviewerSystem } from "../prompts/interviewer";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { getOrCreateSession } from "@/lib/session/store";
import { getProblem } from "@/problems";

const fetchOriginal = globalThis.fetch;
const chaveOriginal = process.env.FEATHERLESS_API_KEY;
const openrouterOriginal = process.env.OPENROUTER_API_KEY;
let saidas: unknown[] = [];
let chamadasAoEntrevistador = 0;

function completion(conteudo: unknown) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(conteudo) }, finish_reason: "stop" }], usage: {} });
}

beforeEach(() => {
  saidas = [];
  chamadasAoEntrevistador = 0;
  process.env.FEATHERLESS_API_KEY = "teste";
  delete process.env.OPENROUTER_API_KEY;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    // O filtro de fala responde com {"safe", "reason"}: aqui, sempre seguro.
    if (corpo.messages[0]?.content.includes('{"safe": boolean')) return completion({ safe: true, reason: "ok" });
    chamadasAoEntrevistador++;
    const saida = saidas.shift();
    if (saida === undefined) throw new Error("sem saída simulada");
    return completion(saida);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (chaveOriginal === undefined) delete process.env.FEATHERLESS_API_KEY;
  else process.env.FEATHERLESS_API_KEY = chaveOriginal;
  if (openrouterOriginal !== undefined) process.env.OPENROUTER_API_KEY = openrouterOriginal;
});

const base = { highlight: null, end: false, gaveHint: false, evidence: null, challenge: null, probeOutcome: null };

test("pensando em voz alta: o entrevistador só ouve, sem fala e sem grifo", async () => {
  const session = getOrCreateSession(`ouvir-${Date.now()}`);
  saidas.push({ ...base, respond: false, concluded: false, reply: "" });
  const r = await runInterviewerTurn(session, { messages: [{ role: "candidate", text: "agora vou montar o loop de fora" }] });
  assert.deepEqual(r, { reply: "", commands: [], end: false, listening: true });
  assert.equal(chamadasAoEntrevistador, 1);
});

test("etapa concluída: responde, avisa a IDE e marca o momento-chave para a próxima análise", async () => {
  const session = getOrCreateSession(`etapa-${Date.now()}`);
  saidas.push({ ...base, respond: true, concluded: true, end: true, reply: "Beleza, primeira versão de pé.", highlight: { startLine: 1, endLine: 1 } });
  const r = await runInterviewerTurn(session, { messages: [{ role: "candidate", text: "terminei a primeira versão" }] });
  assert.equal(r.reply, "Beleza, primeira versão de pé.");
  assert.equal(r.concluded, true);
  assert.equal(r.end, true);
  assert.deepEqual(r.commands[0], { type: "highlight_range", startLine: 1, endLine: 1 });
  assert.notEqual(session.etapaConcluidaEm, undefined);
});

test("resposta comum não marca etapa concluída", async () => {
  const session = getOrCreateSession(`comum-${Date.now()}`);
  saidas.push({ ...base, respond: true, concluded: false, reply: "Então você procura o complemento a cada passo." });
  const r = await runInterviewerTurn(session, { messages: [{ role: "candidate", text: "eu procuro o complemento" }] });
  assert.equal(r.concluded, undefined);
  assert.equal(r.listening, undefined);
  assert.equal(session.etapaConcluidaEm, undefined);
});

test("falha do LLM: a fala de reserva não se repete na mesma sessão", async () => {
  const session = getOrCreateSession(`reserva-${Date.now()}`);
  const primeira = await runInterviewerTurn(session, { messages: [{ role: "candidate", text: "oi" }] });
  const segunda = await runInterviewerTurn(session, {
    messages: [{ role: "candidate", text: "oi" }, { role: "agent", text: primeira.reply }, { role: "candidate", text: "oi de novo" }],
  });
  assert.notEqual(primeira.reply, segunda.reply);
});

test("falaNaoRepetida escolhe a ainda não dita e, se todas foram, a menos recente", () => {
  assert.equal(falaNaoRepetida(["a", "b", "c"], ["a"]), "b");
  assert.equal(falaNaoRepetida(["a", "b"], ["b", "a"]), "b");
});

test("prompt da IDE traz intenção, feedback sem validar, recusa variada e grifo do trecho comentado", () => {
  const sistema = buildInterviewerSystem(DEFAULT_CONFIG, getProblem(DEFAULT_CONFIG.problemId));
  assert.match(sistema, /"respond": boolean, "concluded": boolean/);
  assert.match(sistema, /pela INTENÇÃO/);
  assert.match(sistema, /Pediu feedback/);
  assert.match(sistema, /VARIE a redação a cada recusa/);
  assert.match(sistema, /sem pedir licença/);
  assert.match(sistema, /Sempre que a fala comentar, parafrasear ou perguntar sobre um trecho do código/);
  assert.doesNotMatch(sistema, /Isso eu não posso te dar, a graça é ver como você pensa/);
});
