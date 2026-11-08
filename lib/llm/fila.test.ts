import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { completeJson } from "./index";
import { filaDoProvedor } from "./openaiCompat";

const Saida = z.object({ texto: z.string() });

/** Só Featherless, com o fetch falso: cada pedido fica pendurado até ser liberado (ou abortado). */
function ambiente(t: { after(fn: () => void): void; mock: { method: typeof import("node:test").mock.method } }) {
  const antes = { or: process.env.OPENROUTER_API_KEY, fl: process.env.FEATHERLESS_API_KEY, c: process.env.FEATHERLESS_CONCURRENCY };
  delete process.env.OPENROUTER_API_KEY;
  process.env.FEATHERLESS_API_KEY = "chave-ficticia";
  process.env.FEATHERLESS_CONCURRENCY = "2";
  t.after(() => {
    for (const [k, v] of [["OPENROUTER_API_KEY", antes.or], ["FEATHERLESS_API_KEY", antes.fl], ["FEATHERLESS_CONCURRENCY", antes.c]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  const pendentes: Array<{ modelo: string; soltar: () => void; abortado: () => boolean }> = [];
  t.mock.method(globalThis, "fetch", (_url: unknown, opcoes?: RequestInit) => {
    const corpo = JSON.parse(String(opcoes?.body)) as { messages: { content: string }[] };
    return new Promise<Response>((resolve, reject) => {
      const sinal = opcoes?.signal;
      sinal?.addEventListener("abort", () => {
        const e = new Error("abortado");
        e.name = "AbortError";
        reject(e);
      });
      pendentes.push({
        modelo: corpo.messages[1].content,
        soltar: () =>
          resolve(Response.json({ choices: [{ message: { content: '{"texto":"ok"}' }, finish_reason: "stop" }], usage: {} })),
        abortado: () => sinal?.aborted === true,
      });
    });
  });
  return pendentes;
}

const esperar = () => new Promise((r) => setTimeout(r, 10));

test("análise nunca ocupa a última vaga: a fala entra mesmo com duas análises na fila", async (t) => {
  const pendentes = ambiente(t);
  const a1 = completeJson({ role: "analyst", system: "s", user: "analise-1", schema: Saida });
  const a2 = completeJson({ role: "analyst", system: "s", user: "analise-2", schema: Saida });
  await esperar();
  assert.deepEqual(pendentes.map((p) => p.modelo), ["analise-1"], "a segunda análise espera");
  const fala = completeJson({ role: "conversa", system: "s", user: "fala", schema: Saida });
  await esperar();
  assert.deepEqual(pendentes.map((p) => p.modelo), ["analise-1", "fala"], "a fala pega a vaga reservada");
  pendentes[1].soltar();
  assert.equal((await fala).data.texto, "ok");
  pendentes[0].soltar();
  await a1;
  await esperar();
  pendentes[2].soltar();
  await a2;
  assert.deepEqual(filaDoProvedor("featherless"), { ativas: 0, fundo: 0, esperando: 0 });
});

test("fala passa na frente de análise que já estava esperando", async (t) => {
  const pendentes = ambiente(t);
  const f1 = completeJson({ role: "conversa", system: "s", user: "fala-1", schema: Saida });
  const f2 = completeJson({ role: "conversa", system: "s", user: "fala-2", schema: Saida });
  await esperar();
  const a = completeJson({ role: "analyst", system: "s", user: "analise", schema: Saida });
  const f3 = completeJson({ role: "conversa", system: "s", user: "fala-3", schema: Saida });
  await esperar();
  pendentes[0].soltar();
  await f1;
  await esperar();
  assert.equal(pendentes[2].modelo, "fala-3");
  for (const p of pendentes.slice(1)) p.soltar();
  await Promise.all([f2, f3]);
  await esperar();
  pendentes[3].soltar();
  await a;
  assert.deepEqual(filaDoProvedor("featherless"), { ativas: 0, fundo: 0, esperando: 0 });
});

test("abortar a chamada aborta o fetch e libera a vaga na hora", async (t) => {
  const pendentes = ambiente(t);
  const controle = new AbortController();
  const presa = completeJson({ role: "conversa", system: "s", user: "presa", schema: Saida, signal: controle.signal });
  await esperar();
  assert.equal(filaDoProvedor("featherless").ativas, 1);
  controle.abort();
  await assert.rejects(presa);
  assert.equal(pendentes[0].abortado(), true);
  assert.deepEqual(filaDoProvedor("featherless"), { ativas: 0, fundo: 0, esperando: 0 });
});

test("prazo curto: sem retry depois do timeout (não estoura o prazo de quem chama)", async (t) => {
  const pendentes = ambiente(t);
  const inicio = Date.now();
  await assert.rejects(completeJson({ role: "conversa", system: "s", user: "lenta", schema: Saida, prazoMs: 50 }));
  assert.ok(Date.now() - inicio < 500, "falhou dentro do prazo, sem o backoff de 1 s");
  assert.equal(pendentes.length, 1, "uma tentativa só");
});
