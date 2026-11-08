import assert from "node:assert/strict";
import test from "node:test";
import { definirKvParaTestes, criarKvEmMemoria } from "@/lib/storage/kv";
import { chaveEvento, guardarSessao, sessaoViva } from "@/lib/session/persistencia";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";

type G = typeof globalThis & { __convergeSessions?: Map<string, unknown> };

test("sessão sobrevive à troca de instância e junta eventos de duas instâncias", async () => {
  process.env.SUPABASE_URL = "http://falso.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
  delete process.env.ARMAZENAMENTO;
  definirKvParaTestes({ ...criarKvEmMemoria(), nome: "supabase" } as never);
  const mem = (globalThis as G).__convergeSessions!;
  const id = "sess-persist-1";
  const a = getOrCreateSession(id);
  appendEvent(a, { type: "session_started", sessionId: id, t: 0, language: "python", problemId: a.config.problemId } as never);
  appendEvent(a, { type: "snapshot", sessionId: id, t: 10, version: 1, language: "python", code: "print(1)" } as never);
  await guardarSessao(a);

  // instância nova: memória vazia
  mem.delete(id);
  const b = await sessaoViva(id);
  assert.ok(b, "restaurou");
  assert.equal(b!.events.length, 2);
  assert.equal(b!.codeHistory.at(-1)?.code, "print(1)");

  // outra instância grava um evento; esta ainda não viu
  const copia = structuredClone(b!);
  appendEvent(copia, { type: "snapshot", sessionId: id, t: 20, version: 2, language: "python", code: "print(2)" } as never);
  await guardarSessao(copia);
  appendEvent(b!, { type: "session_ended", sessionId: id, t: 30 } as never);
  await guardarSessao(b!);
  assert.equal(b!.events.length, 4, "uniu os eventos");
  assert.equal(b!.codeHistory.length, 2);
  assert.equal(b!.ended, true);

  // instância atrasada adota a remota
  mem.delete(id);
  const c = await sessaoViva(id);
  assert.equal(c!.events.length, 4);
  definirKvParaTestes(null);
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test("sem Supabase nada muda", async () => {
  definirKvParaTestes(criarKvEmMemoria());
  assert.equal(await sessaoViva("nao-existe"), undefined);
  definirKvParaTestes(null);
});

test("o mesmo evento com as chaves em outra ordem (jsonb) não entra em dobro", () => {
  const a = { type: "speech", sessionId: "s", t: 5, role: "agent", text: "Oi" };
  const b = { text: "Oi", role: "agent", t: 5, sessionId: "s", type: "speech" };
  assert.equal(chaveEvento(a), chaveEvento(b));
  assert.notEqual(chaveEvento(a), chaveEvento({ ...a, t: 6 }));
});

test("instância que não viu a pergunta de outra não a apaga ao gravar", async () => {
  process.env.SUPABASE_URL = "http://falso.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
  delete process.env.ARMAZENAMENTO;
  definirKvParaTestes({ ...criarKvEmMemoria(), nome: "supabase" } as never);
  const mem = (globalThis as G).__convergeSessions!;
  const id = "sess-persist-perguntas";
  const a = getOrCreateSession(id);
  appendEvent(a, { type: "session_started", sessionId: id, t: 0, language: "python", problemId: a.config.problemId } as never);
  await guardarSessao(a);
  // A instância B fica com a cópia de antes; a A levanta uma pergunta e grava.
  const b = structuredClone(a);
  a.queue.push({ id: "q-3", question: "Como você divide o tempo?", followUpTopic: "tempo", priority: 0.8, createdAt: 10, status: "blipped" });
  a.blips.push({ id: "q-3", preview: "Quero entender o seu tempo", priority: 0.8, createdAt: 10 });
  a.pendingBlipId = "q-3";
  await guardarSessao(a);
  // A B grava um evento seu: a pergunta da A tem que continuar lá.
  mem.set(id, b);
  appendEvent(b, { type: "pause", sessionId: id, t: 20, idleMs: 9000 } as never);
  await guardarSessao(b);
  assert.ok(b.blips.some((x) => x.id === "q-3"), "o balão da outra instância continua");
  assert.equal(b.queue.find((q) => q.id === "q-3")?.status, "blipped");
  assert.equal(b.pendingBlipId, "q-3");
  definirKvParaTestes(null);
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
